import { expect } from 'claude-code/testing'
import type { SymccTask } from '../types'
import { checkAndMerge, changedFiles, changesText, MAX_MERGE_RACES, mergeTurn, ownerEdits, withTestLock, TEST_LOCK_POLL_MS } from '../hooks/app/review'
import { testLockText, parseTestLock, waitingTestsNote, TEST_LOCK_STALE_MS, BASH_PATHS_MAX, bashTooManyText } from '../hooks/board'
import { type Board, type BoardTask, workerGitWriteText, addTask, emptyBoard, patchTask, lockText, parseBoard, outOfScopeText, blockedText, mergeBlockers, find, onConflict, spokenLine, statText, REPORT_MAX_CHARS, startRun, withEnd, fmtRun, backToTodo, finishedNote, leadText, resetDoing, commitMessage, finishLimitMs, TEST_TIMEOUT_MS, statusCell, WRAP_UP_TEXT, parseOvertimeAnswer, ANSWER_MAX_CHARS, kindOf, askMoreTask, rowExtra, taskKeys, keepNoteTask, noteFilesInUse, untestedChange, isTestFile, isPlainRelPath, parseSettingValue, type WorkerQuestion, isAnswered, boardText, taskMatches } from '../hooks/board'
import { removeWorktree, cleanupMerged, deleteMergedBranch } from '../hooks/app/git'
import { S, leadQueue, workers, sayQueue, meanwhile, scoutRuns } from '../hooks/app/state'
import { askCall, checkEdit } from '../hooks/app/ask'
import { tellLead, noteForLead, meanwhileText } from '../hooks/app/tell'
import { saidNeedsYou, findPlayers, playable, playsFor, sayNext, sayDone, WIN_TEXT_VAR } from '../hooks/app/voice'
import { workerFinished, setSymcc, setBoardMode, check, pump, startWorker, lateHandBack, WORKER_PROMPT, workerQuestionText, type TurnEnd } from '../hooks/app/workers'
import { claimLead } from '../hooks/app/lead'
import { SPEED_CAP_MS, bestMsOfAsync } from './timing'
import { finishing as finishingSet } from '../hooks/app/state'
import { CLAUDE_WORDS } from '../hooks/claude/host'
import { SYMCC_WORDS } from '../hooks/host'
import { change, load, saveBoard, takeLock, dropLock } from '../hooks/app/store'
import { runTool, ownerSettings, allowAskedFiles, refuseAskedFiles } from '../hooks/app/tools'
import { archiveOld } from '../hooks/app/archive'
import { commandsOf } from './fakes'
// test() from ./reset starts each test with the plugin's memory empty, whatever ran before it (T-291)
import { test } from './reset'
import { fakeDisk } from './fake-disk'
import { fakeHost, memoryFs } from './fake-host'
import { drainStarts, queuedStarts, QUEUED_NOTE } from '../hooks/app/starts'
import { withStarts } from './starts'

/** Whether `call` is `mv -f <file>.<session>.<n>.tmp <file>`: a save of `file` through its own temp file. */
const tmpMove = (call: string, file: string) => {
  const [mv, f, from, to] = call.split(' ')
  return mv === 'mv' && f === '-f' && to === file && !!from && from.startsWith(`${file}.`) && from.endsWith('.tmp') && from !== `${file}.tmp`
}

// The test runtime can't run a real process or touch real files: it has no node: imports, no Bun or
// process globals, and nothing below the plugin answers a Host's fs or run. So these tests run the real merge,
// approve and board code on the shared fake Host (tests/fake-host.ts), with a scripted fake git and in-memory
// files (see world()).

const ROOT = '/repo'
const WT = `${ROOT}/.symcc/worktrees/T-1`
const BOARD = `${ROOT}/.symcc/board.json`
const LOCK = `${ROOT}/.symcc/board.lock`
const T0 = 1_800_000_000_000
const ISO = '2026-11-13T00:00:00.000Z'
// commit ids for the fake git: main (M1, M2), the worker's branch (H0 before its commit, H1 after, H2 after a merge of main,
// H3 after a commit of the owner's edits on top of H1), an older base (B0)
const [M1, M2, H0, H1, H2, B0, H3] = ['a1', 'a2', 'b0', 'b1', 'b2', 'c0', 'b3'].map(x => x.repeat(20)) as [string, string, string, string, string, string, string]
// where the task's branch points when the plugin reads it to delete it (T-493)
const TIP = 'd1'.repeat(20)

/** A path as git shows it without -z: names with a quote, backslash, control or non-ASCII character are quoted and escaped. */
function quoted(p: string): string {
  // eslint-disable-next-line no-control-regex
  if (!/["\\\u0000-\u001f\u007f-\uffff]/.test(p)) return p
  let out = ''
  for (const byte of new TextEncoder().encode(p)) {
    const c = String.fromCharCode(byte)
    out += c === '"' || c === '\\' ? '\\' + c : byte < 0x20 || byte >= 0x7f ? '\\' + byte.toString(8).padStart(3, '0') : c
  }
  return `"${out}"`
}

type Res = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Res => ({ exitCode: 0, stdout, stderr: '' })
const fail = (stderr = '', exitCode = 1): Res => ({ exitCode, stdout: '', stderr })

/**
 * A small fake git: it keeps the commits that matter (main, the worker's HEAD) and answers the commands
 * checkAndMerge and moveTarget run. Every command is recorded in `calls` ("cwd: git args").
 * `answer` can replace the answer to any command (return undefined to keep the fake's own).
 */
type Git = {
  main: string
  head: string
  /** the worker left changes to commit */
  dirty: boolean
  /** main is already in the worker's branch (no "bring up to date" merge needed) */
  upToDate: boolean
  /** merging main into the branch conflicts */
  conflict: boolean
  /** the files the branch changed */
  changed: string[]
  /** the branch the owner has checked out */
  current: string
  /** the owner's `git status --porcelain -z` */
  status: string
  /** `git status --porcelain -z` in the task's folder (WT): the owner's edits there; cleared by a commit */
  wtStatus: string
  /** the project has a commit-msg (and pre-merge-commit) hook that always fails: a commit, or a merge that makes a commit, without --no-verify is refused */
  failingHook?: boolean
  /** where the task's branch (symcc/T-1) points, as `rev-parse --verify -q` shows it (TIP by default) */
  tip?: string
  /** whether the task's branch tip is in the branch it is checked against (`merge-base --is-ancestor TIP refs/heads/...`; true by default) */
  tipMerged?: boolean
  answer?: (args: string[], cwd: string) => Res | undefined
}

/** Board file contents, the fake git, the commands run, and a `$` for the plugin code that uses them. */
function world(g: Partial<Git> = {}, tests: Record<string, Res> = {}) {
  const git: Git = { main: M1, head: H0, dirty: true, upToDate: true, conflict: false, changed: ['src/a.ts', 'src/a.test.ts'], current: 'other', status: '', wtStatus: '', ...g }
  const files = new Map<string, string>()
  const mtime = new Map<string, number>()
  const calls: string[] = []
  const toasts: string[] = []
  let clock = T0
  const sleeps: number[] = []
  let afterSleep = () => {}
  // runs after each command (its text, as in `calls`), before its answer is given back
  let afterRun: (cmd: string) => Promise<void> = async () => {}
  const state = new Map<string, unknown>()
  const put = (p: string, text: string) => (files.set(p, text), mtime.set(p, clock))

  function runGit(args: string[], cwd: string): Res {
    const own = git.answer?.(args, cwd)
    if (own) return own
    const a = args.filter((x, i) => x !== '-c' && args[i - 1] !== '-c')
    const s = a.join(' ')
    const hookFails = () => (git.failingHook && !a.includes('--no-verify') ? { exitCode: 1, stdout: '', stderr: 'husky - commit-msg script failed (code 1)' } : undefined)
    if (a[0] === 'commit') {
      const h = hookFails()
      if (h) return h
      if (!git.dirty) return fail('nothing to commit')
      git.dirty = false
      git.wtStatus = ''
      git.head = git.head === H0 ? H1 : H3
      return ok()
    }
    if (s === 'rev-parse -q --verify HEAD' || s === 'rev-parse HEAD') return ok(git.head)
    if (s === `rev-parse refs/heads/main`) return ok(git.main)
    if (s.startsWith('rev-parse --verify -q refs/heads/symcc/')) return ok(git.tip ?? TIP)
    if (a[0] === 'merge-base' && a[1] === '--is-ancestor' && a[2] === (git.tip ?? TIP)) return git.tipMerged === false ? fail() : ok()
    if (a[0] === 'merge-base' && a[1] === '--is-ancestor') return git.upToDate ? ok() : fail()
    if (a[0] === 'merge-base') return ok(git.upToDate ? git.main : B0)
    // without -z, git quotes unusual names the way it does by default (core.quotePath): "docs/caf\303\251.md"
    if (a[0] === 'diff' && a.includes('--name-only')) return ok(a.includes('-z') ? git.changed.join('\0') : git.changed.map(quoted).join('\n'))
    if (s === 'merge --abort') return ok()
    if (a[0] === 'merge') {
      if (git.conflict) return { exitCode: 1, stdout: 'CONFLICT (content): Merge conflict in src/a.ts', stderr: '' }
      const h = a.includes('--ff-only') ? undefined : hookFails()
      if (h) return h
      git.head = H2
      return ok()
    }
    if (s === 'symbolic-ref --short -q HEAD') return git.current ? ok(git.current) : fail()
    if (a[0] === 'status') return ok(cwd === WT ? git.wtStatus : git.status)
    // update-ref -d ref old: deletes the task's branch only if it is still at old
    if (a[0] === 'update-ref' && a[1] === '-d') return a[3] === (git.tip ?? TIP) ? ok() : fail(`cannot lock ref '${a[2]}'`)
    if (a[0] === 'update-ref') {
      // update-ref -m note ref new old: moves only if ref is still at old
      const [, , , ref, to, from] = a
      if (ref !== 'refs/heads/main') return fail('unknown ref')
      if (git.main !== from) return fail(`cannot lock ref '${ref}'`)
      git.main = to!
      return ok()
    }
    if (a[0] === 'read-tree') return ok()
    if (s === '--version') return ok('git version 2.50.0')
    if (s === 'rev-parse --is-inside-work-tree') return ok('true')
    if (s === 'rev-parse --verify -q HEAD' || s === 'rev-parse --verify -q refs/heads/main') return ok('x')
    return ok()
  }

  async function answerRun(argv: readonly string[], o: { cwd?: string }): Promise<Res> {
    const cwd = o.cwd ?? ROOT
    const [cmd, ...rest] = argv
    if (cmd === 'git') {
      calls.push(`${cwd === WT ? 'wt' : cwd === ROOT ? 'root' : cwd}: git ${rest.join(' ')}`)
      return runGit(rest, cwd)
    }
    calls.push(argv.join(' '))
    if (cmd === '/bin/sh') return tests[rest[1]!] ?? ok()
    if (cmd === 'ln') {
      // ln fails when the target exists: only one session can take the lock
      if (files.has(rest[1]!)) return fail('File exists')
      put(rest[1]!, files.get(rest[0]!)!)
      return ok()
    }
    if (cmd === 'mv') {
      const [, from, to] = rest
      if (!files.has(from!)) return fail('No such file')
      put(to!, files.get(from!)!)
      files.delete(from!)
      return ok()
    }
    if (cmd === 'rm') {
      for (const p of rest.filter(x => !x.startsWith('-'))) files.delete(p)
      return ok()
    }
    return ok()
  }

  const { host } = fakeHost({
    run: async (argv, o = {}) => {
      const r = await answerRun(argv, o)
      await afterRun(calls.at(-1)!)
      return r
    },
    fs: memoryFs(files, p => mtime.get(p)!),
    // no agent starts in this world unless a test gives one (spawn = ...)
    agents: { spawn: async () => Promise.reject(new Error('no agents in this world')) },
    ui: { toast: (t: unknown) => void toasts.push(JSON.stringify(t)) },
    clock: {
      // never fires: what reaches the lead is read from leadQueue instead
      after: () => ({ cancel() {} }),
      // a fake wait: moves the fake time on, never really waits
      sleep: async (ms: number) => {
        sleeps.push(ms)
        clock += ms
        afterSleep()
      },
    },
  })
  S.root = ROOT
  S.leadTimer = null
  S.writing = Promise.resolve()
  S.driving = false
  S.startupDone = false
  S.enabledNow = true
  S.leadUrgent = false
  leadQueue.splice(0)
  meanwhile.splice(0)
  return { $: host, git, files, calls, toasts, put, sleeps, onSleep: (f: () => void) => void (afterSleep = f), onRun: (f: (cmd: string) => Promise<void>) => void (afterRun = f) }
}

/** A board with one task T-1 (files src/), in `mode`, with `test_commands`. */
/** What a try recorded for its hand-back: an ask_owner call (`question`) and edits refused as outside its files (`requested`). */
type Rec = { question?: WorkerQuestion; requested?: string[] }
/** Board `b` with T-1's current try holding `rec`, as ask_owner and the tool.check hook write it. */
const recorded = (b: Board, rec: Rec = {}) => (rec.question || rec.requested ? patchTask(b, 'T-1', { ...(rec.question ? { try_question: rec.question } : {}), ...(rec.requested ? { try_refused: rec.requested } : {}) }, ISO) : b)

function boardWith(mode: 'auto' | 'review', test_commands: string[] = [], extra: Partial<BoardTask> = {}): [Board, BoardTask] {
  const [b, t] = addTask({ ...emptyBoard(), mode, test_commands }, { origin: { why: 'a test' }, title: 'Do it', files: ['src/'] }, ISO)
  const b2 = patchTask(b, t.id, { status: 'doing', attempts: 1, ...extra }, ISO)
  return [b2, b2.tasks[0]!]
}

// ---------------- the board store ----------------

test('saveBoard then load gives back the same board, written through a temp file', async () => {
  const w = world()
  const [b] = boardWith('auto', ['npm test'])
  await saveBoard(w.$, b)
  expect([...w.files.keys()].filter(p => p.startsWith(`${BOARD}.`) && p.endsWith('.tmp'))).toEqual([])
  expect(w.calls.some(c => tmpMove(c, BOARD))).toBe(true)
  expect(await load(w.$)).toEqual(parseBoard(JSON.stringify(b)))
  expect((await load(w.$)).tasks[0]!.title).toBe('Do it')
})

test('change() reads the board, applies the change and saves it, and drops its lock', async () => {
  const w = world()
  const [b] = boardWith('auto')
  await saveBoard(w.$, b)
  const value = await change(w.$, x => [patchTask(x, 'T-1', { note: 'changed' }, ISO), 'done'] as [Board, string])
  expect(value).toBe('done')
  expect(find(await load(w.$), 'T-1')!.note).toBe('changed')
  expect(w.files.has(LOCK)).toBe(false)
})

test('a stale lock left by a dead session is taken over at once', async () => {
  const w = world()
  // dated at 1970: stale whatever the time is now
  w.put(LOCK, lockText('dead-session', 0))
  const mine = await takeLock(w.$)
  expect(JSON.parse(mine).session).toMatch(/^me:/)
  expect(w.files.get(LOCK)).toBe(mine)
  expect(w.sleeps).toEqual([])
  // its own temp file is gone
  expect([...w.files.keys()].filter(p => p.endsWith('.tmp'))).toEqual([])
  await dropLock(w.$, mine)
  expect(w.files.has(LOCK)).toBe(false)
})

test('a fresh lock held by another session is not taken over: it waits until that session lets go', async () => {
  const w = world()
  const theirs = lockText('other-session', Date.now())
  w.put(LOCK, theirs)
  const seen: (string | undefined)[] = []
  // the fake wait: look at the lock, then the other session drops it
  w.onSleep(() => {
    seen.push(w.files.get(LOCK))
    w.files.delete(LOCK)
  })
  const mine = await takeLock(w.$)
  expect(seen).toEqual([theirs])
  expect(w.sleeps).toEqual([100])
  expect(w.files.get(LOCK)).toBe(mine)
  expect(mine).not.toBe(theirs)
})

test('dropLock leaves alone a lock that is not its own', async () => {
  const w = world()
  const theirs = lockText('other-session', T0)
  w.put(LOCK, theirs)
  await dropLock(w.$, lockText('me:abc', T0))
  expect(w.files.get(LOCK)).toBe(theirs)
})

test('change() on a board.json that cannot be read refuses, keeps a copy, and never overwrites it', async () => {
  const w = world()
  const text = '{"version":1,"tasks":[{"id":"T-1",}]}'
  w.put(BOARD, text)
  let ran = false
  const err = await change(w.$, x => ((ran = true), x)).then(() => null, (e: Error) => e.message)
  expect(err).toMatch(/board\.json can't be read/)
  expect(ran).toBe(false)
  expect(w.files.get(BOARD)).toBe(text)
  expect([...w.files.keys()].filter(p => p.startsWith(`${BOARD}.`) && p.endsWith('.tmp'))).toEqual([])
  const copies = [...w.files.entries()].filter(([p]) => p.startsWith(`${BOARD}.broken-`))
  expect(copies.map(([, t]) => t)).toEqual([text])
  expect(w.toasts.some(t => /board\.json can't be read/.test(t))).toBe(true)
  expect(w.files.has(LOCK)).toBe(false)
})

test('the same broken board.json text as the test above is reported again here: each test starts with nothing reported', async () => {
  const w = world()
  const text = '{"version":1,"tasks":[{"id":"T-1",}]}'
  w.put(BOARD, text)
  const err = await change(w.$, x => x).then(() => null, (e: Error) => e.message)
  expect(err).toMatch(/board\.json can't be read/)
  expect(w.toasts.some(t => /board\.json can't be read/.test(t))).toBe(true)
  expect([...w.files.entries()].filter(([p]) => p.startsWith(`${BOARD}.broken-`)).map(([, t]) => t)).toEqual([text])
})

test('saveBoard says so when the board cannot be moved into place', async () => {
  const w = world()
  const run = w.$
  const real = run.run
  run.run = async a => (a[0] === 'mv' ? fail('mv: Permission denied') : real(a))
  const err = await saveBoard(w.$, boardWith('auto')[0]).then(() => null, (e: Error) => e.message)
  expect(err).toBe("couldn't save the board: mv: Permission denied")
  expect(w.files.has(BOARD)).toBe(false)
})

// ---------------- checkAndMerge ----------------

const ranTests = (w: ReturnType<typeof world>) => w.calls.filter(c => c.startsWith('/bin/sh -c '))
const movedMain = (w: ReturnType<typeof world>) => w.calls.some(c => / git update-ref .*refs\/heads\/main/.test(c))

test('checkAndMerge commits the work, runs the tests and moves main to it', async () => {
  const w = world()
  const [b, t] = boardWith('auto', ['npm test'])
  const made: string[] = []
  const r = await checkAndMerge(w.$, t, WT, b, 'finish', made)
  expect(r).toEqual({ ok: true, merged: H1, detail: `merged into main (${H1.slice(0, 8)}); tests passed` })
  expect(w.git.main).toBe(H1)
  expect(made).toEqual([H1])
  expect(ranTests(w)).toEqual(['/bin/sh -c npm test'])
  // the owner doesn't have main checked out: their files are not touched
  expect(w.calls.some(c => / git read-tree /.test(c))).toBe(false)
})

test('checkAndMerge with no change at all merges nothing', async () => {
  const w = world({ dirty: false, changed: [] })
  const [b, t] = boardWith('auto', ['npm test'])
  const made: string[] = []
  expect(await checkAndMerge(w.$, t, WT, b, 'finish', made)).toEqual({ ok: false, detail: 'the worker made no change' })
  expect(made).toEqual([])
  expect(movedMain(w)).toBe(false)
})

test('checkAndMerge lets unusual file names inside the task pass the scope check', async () => {
  const w = world({ changed: ['docs/café.md', 'docs/a"b.md'] })
  const [b, t] = boardWith('auto', [], { files: ['docs/'] })
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r.detail).not.toContain('outside the task')
  expect(w.calls.some(c => c.includes('diff --name-only') && c.includes('-z'))).toBe(true)
})

test('checkAndMerge still refuses an unusual file name outside the task, and shows it readably', async () => {
  const w = world({ changed: ['docs/café.md', 'src/b\u001b[31m"x.ts'] })
  const [b, t] = boardWith('auto', ['npm test'], { files: ['docs/'] })
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r.ok).toBe(false)
  expect(r.detail).toContain('changed files outside the task (src/b?[31m"x.ts); allowed: docs/')
  expect(r.detail).not.toContain('café')
  expect(ranTests(w)).toEqual([])
})

test('checkAndMerge refuses a change to a file outside the task, before testing or merging', async () => {
  const w = world({ changed: ['src/a.ts', 'docs/x.md'] })
  const [b, t] = boardWith('auto', ['npm test'])
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r).toEqual({ ok: false, detail: outOfScopeText(['docs/x.md'], ['src/'], true) })
  expect(r.detail).toContain('were undone on the task\'s branch, so the next try starts without them')
  expect(r.detail).not.toContain('To fix')
  expect(ranTests(w)).toEqual([])
  expect(w.git.main).toBe(M1)
})

test('checkAndMerge undoes files outside the task on the branch, so the next try passes and keeps the work inside it', async () => {
  // try 1 changes src/a.ts (inside) and docs/x.md (outside)
  const w = world({ changed: ['src/a.ts', 'docs/x.md'] })
  w.git.answer = (args, cwd) => {
    if (args[0] !== 'restore') return undefined
    // restoring docs/x.md from the merge base leaves only src/a.ts changed on the branch
    if (cwd === WT && args.includes(`--source=${M1}`) && args.includes(':(literal)docs/x.md') && !args.some(a => a.includes('src/a.ts'))) {
      w.git.changed = ['src/a.ts']
      w.git.dirty = true
      return ok()
    }
    return fail('bad restore')
  }
  const [b, t] = boardWith('auto', ['npm test'])
  const made1: string[] = []
  const r1 = await checkAndMerge(w.$, t, WT, b, 'finish', made1)
  expect(r1).toEqual({ ok: false, detail: outOfScopeText(['docs/x.md'], ['src/'], true) })
  expect(w.calls.some(c => c.startsWith('wt: git ') && c.includes(' commit ') && c.includes('T-1: undo changes outside the task'))).toBe(true)
  expect(made1).toEqual([H1, H3])
  expect(w.git.main).toBe(M1)
  // try 2, in the same folder, changes only src/a.ts: it passes the scope check and merges, with try 1's src/a.ts work still on the branch
  w.git.dirty = true
  const r2 = await checkAndMerge(w.$, { ...t, attempts: 2 }, WT, b, 'finish', [])
  expect(r2.ok).toBe(true)
  expect(r2.detail).toContain('merged into main')
  expect(w.git.changed).toEqual(['src/a.ts'])
  expect(w.git.main).toBe(w.git.head)
})

test('checkAndMerge says so when it could not undo the files outside the task', async () => {
  const w = world({ changed: ['src/a.ts', 'docs/x.md'], answer: args => (args[0] === 'restore' ? fail('restore broke') : undefined) })
  const [b, t] = boardWith('auto', ['npm test'])
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r).toEqual({ ok: false, detail: `${outOfScopeText(['docs/x.md'], ['src/'])}. Could not undo them on the task's branch: restore broke` })
})

test('checkAndMerge brings the branch up to date when main moved on, tests that, and merges it', async () => {
  const w = world({ upToDate: false })
  const [b, t] = boardWith('auto', ['npm test'])
  const made: string[] = []
  const r = await checkAndMerge(w.$, t, WT, b, 'finish', made)
  expect(r).toEqual({ ok: true, merged: H2, detail: `merged into main (${H2.slice(0, 8)}); tests passed` })
  expect(made).toEqual([H1, H2])
  expect(w.calls.some(c => c.startsWith('wt: git ') && / merge --no-edit --no-verify -m T-1: bring up to date with main/.test(c) && c.endsWith(` ${M1}`))).toBe(true)
  expect(ranTests(w).length).toBe(1)
  expect(w.git.main).toBe(H2)
})

test('checkAndMerge brings the branch up to date even when the project has a commit-msg hook that always fails (--no-verify)', async () => {
  const w = world({ upToDate: false, failingHook: true })
  const [b, t] = boardWith('auto', ['npm test'])
  const made: string[] = []
  const r = await checkAndMerge(w.$, t, WT, b, 'finish', made)
  expect(r).toEqual({ ok: true, merged: H2, detail: `merged into main (${H2.slice(0, 8)}); tests passed` })
  expect(made).toEqual([H1, H2])
  expect(w.git.main).toBe(H2)
})

test('checkAndMerge on a conflict with main aborts the merge and says it conflicts', async () => {
  const w = world({ upToDate: false, conflict: true })
  const [b, t] = boardWith('auto', ['npm test'])
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r).toEqual({ ok: false, conflict: true, detail: 'conflicts with the latest main' })
  expect(w.calls).toContain('wt: git merge --abort')
  expect(ranTests(w)).toEqual([])
  expect(w.git.main).toBe(M1)
})

test('checkAndMerge when main moved during the merge brings it in, tests again and merges by itself', async () => {
  let raced = false
  const w = world({
    // another merge lands on main just before ours first tries to move it
    answer: a => {
      if (a[0] === 'update-ref' && !raced) {
        raced = true
        w.git.main = M2
        w.git.upToDate = false
      }
      return undefined
    },
  })
  const [b, t] = boardWith('auto', ['npm test'])
  const made: string[] = []
  const r = await checkAndMerge(w.$, t, WT, b, 'finish', made)
  expect(r).toEqual({ ok: true, merged: H2, detail: `merged into main (${H2.slice(0, 8)}); tests passed` })
  expect(made).toEqual([H1, H2])
  // the other change was brought in (M2), then the tests ran again on top of it
  expect(w.calls.some(c => c.startsWith('wt: git ') && / merge --no-edit --no-verify -m T-1: bring up to date with main/.test(c) && c.endsWith(` ${M2}`))).toBe(true)
  expect(ranTests(w).length).toBe(2)
  expect(w.git.main).toBe(H2)
})

test('checkAndMerge when main keeps moving during every merge gives up after a few tries and says so', async () => {
  let n = 0
  const w = world({
    // main moves again just before each of our moves
    answer: a => {
      if (a[0] === 'update-ref') {
        w.git.main = `d${++n}`.padEnd(40, '0')
        w.git.upToDate = false
      }
      return undefined
    },
  })
  const [b, t] = boardWith('auto')
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r).toEqual({ ok: false, detail: 'main moved during the merge; try again' })
  expect(n).toBe(MAX_MERGE_RACES)
  expect(w.git.main).toBe(`d${n}`.padEnd(40, '0'))
})

test('checkAndMerge that loses the race and then conflicts with the new main still fails as a conflict', async () => {
  const w = world({
    answer: a => {
      if (a[0] === 'update-ref' && !w.git.conflict) {
        w.git.main = M2
        w.git.upToDate = false
        w.git.conflict = true
      }
      return undefined
    },
  })
  const [b, t] = boardWith('auto')
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r).toEqual({ ok: false, conflict: true, detail: 'conflicts with the latest main' })
  expect(w.git.main).toBe(M2)
})

test('checkAndMerge fails with git\'s error when git add fails, and commits nothing', async () => {
  const w = world({ answer: a => (a[0] === 'add' ? fail('fatal: Unable to create \'/repo/.git/index.lock\': File exists.', 128) : undefined) })
  const [b, t] = boardWith('auto', ['npm test'])
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r).toEqual({ ok: false, detail: "symcc could not stage the work (git add): fatal: Unable to create '/repo/.git/index.lock': File exists." })
  expect(w.calls.some(c => / git commit /.test(c) || c.includes(' commit -q '))).toBe(false)
  expect(ranTests(w)).toEqual([])
})

test('checkAndMerge with a commit that fails (signing) gives git\'s error, not "no change"', async () => {
  const w = world({ answer: a => (a.includes('commit') ? fail('error: gpg failed to sign the data\nfatal: failed to write commit object', 128) : undefined) })
  w.git.changed = []
  const [b, t] = boardWith('auto', ['npm test'])
  const made: string[] = []
  const r = await checkAndMerge(w.$, t, WT, b, 'finish', made)
  expect(r.ok).toBe(false)
  expect(r.detail).toContain('symcc could not commit the work: error: gpg failed to sign the data | fatal: failed to write commit object')
  expect(r.detail).toContain('git config commit.gpgsign false')
  expect(r.detail).not.toContain('no change')
  expect(made).toEqual([])
  expect(movedMain(w)).toBe(false)
})

test('checkAndMerge with nothing to commit (and nothing changed) still says the worker made no change', async () => {
  const w = world({ dirty: false, changed: [] })
  w.git.answer = a => (a.includes('commit') ? { exitCode: 1, stdout: 'nothing to commit, working tree clean', stderr: '' } : undefined)
  const [b, t] = boardWith('auto')
  expect(await checkAndMerge(w.$, t, WT, b)).toEqual({ ok: false, detail: 'the worker made no change' })
})

test('checkAndMerge says the files outside the task were not undone when the undo commit fails', async () => {
  const w = world({ changed: ['src/a.ts', 'docs/x.md'] })
  w.git.answer = a => {
    if (a[0] === 'restore') return (w.git.dirty = true, ok())
    if (a.includes('commit') && a.some(x => x.includes('undo changes outside the task'))) return fail('error: gpg failed to sign the data', 128)
    return undefined
  }
  const [b, t] = boardWith('auto', ['npm test'])
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r.detail.startsWith(`${outOfScopeText(['docs/x.md'], ['src/'])}. Could not undo them on the task's branch: error: gpg failed to sign the data`)).toBe(true)
  expect(r.detail).not.toContain('were undone')
})

test('checkAndMerge when bringing in main fails for another reason than a conflict gives git\'s error, not a conflict', async () => {
  const w = world({ upToDate: false, answer: a => (a.includes('merge') && a.includes('--no-edit') ? fail('error: gpg failed to sign the data\nfatal: failed to write commit object', 128) : undefined) })
  const [b, t] = boardWith('auto', ['npm test'])
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r.ok).toBe(false)
  expect(r.conflict).toBeUndefined()
  expect(r.detail).toContain('symcc could not bring the work up to date with main (git merge): error: gpg failed to sign the data')
  expect(r.detail).not.toContain('conflicts')
  expect(w.calls).toContain('wt: git merge --abort')
  expect(ranTests(w)).toEqual([])
  expect(w.git.main).toBe(M1)
})

test('checkAndMerge when main is locked (a stale lock file) gives git\'s error once: no retries, no extra test runs', async () => {
  let tries = 0
  const w = world({ answer: a => (a[0] === 'update-ref' ? (tries++, fail("fatal: cannot lock ref 'refs/heads/main': Unable to create '/repo/.git/refs/heads/main.lock': File exists.", 128)) : undefined) })
  const [b, t] = boardWith('auto', ['npm test'])
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r).toEqual({ ok: false, detail: 'could not move main: a git lock file is in the way: /repo/.git/refs/heads/main.lock; if no git is running, remove it, then say "retry T-1"' })
  expect(tries).toBe(1)
  expect(ranTests(w).length).toBe(1)
  expect(w.git.main).toBe(M1)
})

test('mergeTurn runs merges into the same branch one after another, even when one fails; other branches do not wait', async () => {
  const log: string[] = []
  let open: () => void = () => {}
  const gate = new Promise<void>(r => (open = r))
  const a = mergeTurn('main', async () => (log.push('a start'), await gate, log.push('a end'), 'a'))
  const b = mergeTurn('main', async () => (log.push('b'), Promise.reject(new Error('b broke'))))
  const c = mergeTurn('main', async () => (log.push('c'), 'c'))
  const d = mergeTurn('dev', async () => (log.push('d'), 'd'))
  expect(await d).toBe('d')
  expect(log).toEqual(['a start', 'd'])
  open()
  expect(await a).toBe('a')
  await expect(b).rejects.toThrow('b broke')
  expect(await c).toBe('c')
  expect(log).toEqual(['a start', 'd', 'a end', 'b', 'c'])
})

test('checkAndMerge on a checked-out main merges around the owner\'s uncommitted changes in other files, and leaves them alone', async () => {
  const w = world({ current: 'main', status: ' M README.md\0M  docs/notes.md\0' })
  const [b, t] = boardWith('auto')
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r).toEqual({ ok: true, merged: H1, detail: `merged into main (${H1.slice(0, 8)}); no test command set` })
  expect(w.git.main).toBe(H1)
  // the dry run first, then the files are updated with read-tree -m -u, which keeps changes to files the merge doesn't change
  const root = w.calls.filter(c => c.startsWith('root: git '))
  expect(root.indexOf(`root: git read-tree -n -m -u ${M1} ${H1}`)).toBeLessThan(root.indexOf(`root: git read-tree -m -u ${M1} ${H1}`))
  // nothing that could throw the owner's edits away ran in their folder
  expect(root.some(c => / git (reset|checkout|stash|restore|clean|merge) /.test(c))).toBe(false)
  expect(w.git.status).toBe(' M README.md\0M  docs/notes.md\0')
})

test('checkAndMerge waits when the owner has uncommitted changes in a file the task changes, and names it', async () => {
  const w = world({ current: 'main', status: ' M src/a.ts\0 M README.md\0' })
  const [b, t] = boardWith('auto')
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r).toEqual({ ok: false, detail: blockedText('main', 'T-1', { dirty: ['src/a.ts'], untracked: [] }), blocked: { dirty: ['src/a.ts'], untracked: [], ignored: [] } })
  expect(r.detail).toBe('you have uncommitted changes on main to files T-1 changes (src/a.ts); commit or stash them, and T-1 merges on its own at the next check')
  expect(movedMain(w)).toBe(false)
  expect(w.calls.some(c => c.includes('read-tree'))).toBe(false)
})

test('checkAndMerge waits when an untracked file of the owner would be overwritten by the merge', async () => {
  const w = world({ current: 'main', status: '?? src/a.ts\0?? notes.txt\0' })
  const [b, t] = boardWith('auto')
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r.ok).toBe(false)
  expect(r.detail).toBe('you have untracked files on main that T-1 would overwrite (src/a.ts); move, rename or commit them, and T-1 merges on its own at the next check')
  expect(movedMain(w)).toBe(false)
})

test('checkAndMerge on a checked-out main with only untracked files out of the way merges and updates the files', async () => {
  const w = world({ current: 'main', status: '?? notes.txt\0?? .symcc/board.json\0' })
  const [b, t] = boardWith('auto')
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r).toEqual({ ok: true, merged: H1, detail: `merged into main (${H1.slice(0, 8)}); no test command set` })
  expect(w.calls).toContain(`root: git read-tree -m -u ${M1} ${H1}`)
})

test('checkAndMerge waits and names a git-ignored file of the owner that the merge would overwrite', async () => {
  // main ignores config.local.json and the owner has a private one; the task adds an example one
  const w = world({ current: 'main', changed: ['src/config.local.json'], status: '!! src/config.local.json\0!! node_modules/\0' })
  const [b, t] = boardWith('auto')
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r.ok).toBe(false)
  expect(r.detail).toBe('you have git-ignored files on main that T-1 would overwrite (src/config.local.json); move or rename them, and T-1 merges on its own at the next check')
  expect(w.calls).toContain('root: git status --porcelain -z --untracked-files=all --ignored=matching')
  expect(movedMain(w)).toBe(false)
  expect(w.calls.some(c => c.includes('read-tree -m -u'))).toBe(false)
})

test('checkAndMerge waits when the merge adds a file inside a git-ignored folder of the owner', async () => {
  const w = world({ current: 'main', changed: ['src/build/out.js'], status: '!! src/build/\0' })
  const [b, t] = boardWith('auto')
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r.ok).toBe(false)
  expect(r.detail).toContain('git-ignored files on main that T-1 would overwrite (src/build/)')
  expect(movedMain(w)).toBe(false)
})

test('checkAndMerge merges when the owner\'s git-ignored files are not touched by the merge', async () => {
  const w = world({ current: 'main', status: '!! node_modules/\0!! config.local.json\0!! .symcc/\0!! app.log\0' })
  const [b, t] = boardWith('auto')
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r).toEqual({ ok: true, merged: H1, detail: `merged into main (${H1.slice(0, 8)}); no test command set` })
  expect(w.calls).toContain(`root: git read-tree -m -u ${M1} ${H1}`)
})

test('mergeBlockers sorts dirty, untracked and ignored paths and skips the board folder', () => {
  const st = ' M README.md\0 M other.md\0?? src/a.ts\0!! secret.env\0!! .symcc/\0?? .symcc/board.json\0!! dist/\0'
  expect(mergeBlockers(st, ['README.md', 'src/a.ts', 'secret.env', '.symcc/board.json'], '.symcc')).toEqual({ dirty: ['README.md'], untracked: ['src/a.ts'], ignored: ['secret.env'] })
})

test('blockedText hides control characters in file names', () => {
  expect(blockedText('main', 'T-1', { dirty: [], untracked: [], ignored: ['a\nb\u001b[31m.txt'] })).toBe('you have git-ignored files on main that T-1 would overwrite (a?b?[31m.txt); move or rename them, and T-1 merges on its own at the next check')
})

test('checkAndMerge puts main back and says "not merged" when updating the files fails after main moved', async () => {
  const w = world({ current: 'main', answer: a => (a.join(' ') === `read-tree -m -u ${M1} ${H1}` ? fail("error: Entry 'src/a.ts' not uptodate. Cannot merge.", 128) : undefined) })
  const [b, t] = boardWith('auto')
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r.ok).toBe(false)
  expect(r.detail).toBe('not merged: your files on main could not be updated (error: Entry \'src/a.ts\' not uptodate. Cannot merge.); main is back where it was and your files are unchanged. Fix that, then say "retry T-1"')
  expect(w.git.main).toBe(M1)
  expect(w.calls.filter(c => / git update-ref /.test(c))).toEqual([`root: git update-ref -m symcc T-1 refs/heads/main ${H1} ${M1}`, `root: git update-ref -m symcc T-1 (undone) refs/heads/main ${M1} ${H1}`])
})

test('checkAndMerge stops at the first failing test command and merges nothing', async () => {
  const w = world({}, { 'npm test': { exitCode: 2, stdout: '1 test failed', stderr: 'boom' } })
  const [b, t] = boardWith('auto', ['npm run lint', 'npm test', 'npm run e2e'])
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r.ok).toBe(false)
  expect(r.detail).toBe('tests failed: `npm test` (exit 2). 1 test failed | boom')
  expect(r.testOutput).toContain('$ npm test (exit 2)')
  expect(r.testOutput).toContain('1 test failed')
  expect(ranTests(w)).toEqual(['/bin/sh -c npm run lint', '/bin/sh -c npm test'])
  expect(w.git.main).toBe(M1)
})

test('checkAndMerge in mode review stops after the tests and merges nothing', async () => {
  const w = world()
  const [b, t] = boardWith('review', ['npm test'])
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r).toEqual({ ok: true, review: true, detail: 'checks passed; tests passed; ready for review, nothing merged yet' })
  expect(movedMain(w)).toBe(false)
})

// ---------------- a code change with no test file (tests_with_changes) ----------------

/** T-1's worker (agent ag1) finished with the files `changed`, on a board in mode auto with tests_with_changes `flag` (absent: the default). */
async function finishedWith(changed: string[], flag?: 'off' | 'ask' | 'review') {
  const w = world({ changed })
  const [b] = boardWith('auto', ['npm test'])
  await saveBoard(w.$, flag ? { ...b, tests_with_changes: flag } : b)
  w.put(`${WT}/.git`, 'gitdir: x')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  await workerFinished(w.$, 'ag1', 'made the change')
  return { w, t: find(await load(w.$), 'T-1')!, told: leadQueue.join('\n') }
}

// T-492 (T-452 follow-up): this is here, not in turn-complete.test.tsx, because Claude Code's turn.complete carries no
// dollar cost; a host that knows one (OpenCode) calls workerFinished with it, as this test does.
test("T-492: a hand-back kept while board.json can't be read keeps the try's dollar cost; once the board is back the check finishes it with that cost on its last run", async () => {
  const w = world({ changed: ['src/a.ts', 'src/a.test.ts'] })
  const [b] = boardWith('auto', ['npm test'], { runs: [{ started: ISO }] })
  await saveBoard(w.$, b)
  const good = w.files.get(BOARD)!
  w.put(`${WT}/.git`, 'gitdir: x')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  w.put(BOARD, '{ not json')
  await workerFinished(w.$, 'ag1', 'made the change', { reason: 'answer' }, undefined, 0.42)
  expect(w.files.get(BOARD)).toBe('{ not json')
  // the owner puts a valid board back; the regular check finishes the kept hand-back (without waiting for it)
  w.put(BOARD, good)
  const status = () => (JSON.parse(w.files.get(BOARD)!) as Board).tasks[0]!.status
  S.driving = true
  try {
    await check(w.$)
    for (let i = 0; i < 20_000 && (status() !== 'done' || finishingSet.size); i++) await Promise.resolve()
  } finally {
    S.driving = false
  }
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.runs?.at(-1)?.cost).toBe(0.42)
})

test('tests_with_changes ask (the default): a code change with no test file merges and the lead is told', async () => {
  const { w, t, told } = await finishedWith(['src/a.ts'])
  expect(t.status).toBe('done')
  expect(w.git.main).toBe(H1)
  expect(told).toContain('T-1 changed code but no test')
  const asked = await finishedWith(['src/a.ts'], 'ask')
  expect(asked.t.status).toBe('done')
  expect(asked.told).toContain('T-1 changed code but no test')
})

test('tests_with_changes review: a code change with no test file waits for review instead of merging, with the note', async () => {
  const { w, t, told } = await finishedWith(['src/a.ts'], 'review')
  expect(t.status).toBe('review')
  expect(t.note).toContain('T-1 changed code but no test')
  expect(movedMain(w)).toBe(false)
  expect(told).toContain('T-1 changed code but no test')
  expect(told).toContain('is ready for review')
})

// ---------------- secret-looking files are never committed or merged (T-383) ----------------

/**
 * A fake git for a worker change of `changed` in a task with files src/ and tests/: `git restore --staged`
 * of a file takes it out of what is staged (git.changed), as real git does; `committed`: the worker already
 * committed these files itself, so they are in the branch before symcc's own commit (nothing is staged).
 */
function secretWorld(changed: string[], committed = false, deleted: string[] = [], history: string[] = []) {
  const w = world({ changed: [...changed] })
  const restored: string[] = []
  // --diff-filter=d: deleted files are not listed, as with real git
  const listed = (args: string[]) => (args.includes('--diff-filter=d') ? w.git.changed.filter(f => !deleted.includes(f)) : w.git.changed)
  w.git.answer = (args, cwd) => {
    if (cwd === WT && args[0] === 'diff' && args.includes('--cached')) return ok(committed ? '' : listed(args).join('\0'))
    // `history`: files any of the branch's commits added or changed, even ones a later commit deleted again
    if (args[0] === 'log' && args.includes('--name-only')) return ok(history.join('\0'))
    if (args[0] === 'diff' && args.includes('--name-only')) return ok(listed(args).join('\0'))
    if (cwd === WT && args[0] === 'restore' && args.includes('--staged') && !args.includes('--worktree')) {
      const files = args.slice(args.indexOf('--') + 1).map(a => a.replace(/^:\(literal\)/, ''))
      restored.push(...files)
      w.git.changed = w.git.changed.filter(f => !files.includes(f))
      w.git.dirty = true
      return ok()
    }
    return undefined
  }
  return { w, restored }
}

/** T-1's worker (agent ag1) finished with `changed` (files src/ and tests/), on a board in mode auto. */
async function finishedWithSecrets(changed: string[], committed = false, { deleted = [] as string[], mode = 'auto' as 'auto' | 'review', history = [] as string[], prep = (_w: ReturnType<typeof world>) => {} } = {}) {
  const { w, restored } = secretWorld(changed, committed, deleted, history)
  // `prep`: changes the fake git before the worker finishes (e.g. makes a step fail)
  prep(w)
  const [b] = boardWith(mode, ['npm test'], { files: ['src/', 'tests/'] })
  await saveBoard(w.$, b)
  w.put(`${WT}/.git`, 'gitdir: x')
  for (const f of changed) if (!deleted.includes(f)) w.put(`${WT}/${f}`, `contents of ${f}`)
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  await workerFinished(w.$, 'ag1', 'made the change')
  return { w, restored, t: find(await load(w.$), 'T-1')!, told: leadQueue.join('\n') }
}

test('a change with src/a.ts and tests/.env merges src/a.ts only; the history and the lead name tests/.env', async () => {
  const { w, restored, t, told } = await finishedWithSecrets(['src/a.ts', 'tests/.env'])
  expect(t.status).toBe('done')
  // taken out of what is staged before symcc's commit, so no commit (and so not main) ever holds it
  expect(restored).toEqual(['tests/.env'])
  const unstage = w.calls.findIndex(c => c.startsWith('wt: git restore --staged'))
  const commit = w.calls.findIndex(c => c.startsWith('wt: git ') && c.includes(' commit '))
  expect(unstage).toBeGreaterThan(-1)
  expect(unstage).toBeLessThan(commit)
  // never restored in the folder itself: the file stays on disk there
  expect(w.calls.some(c => c.includes('restore') && c.includes('--worktree'))).toBe(false)
  expect(w.git.changed).toEqual(['src/a.ts'])
  expect(w.git.main).toBe(H1)
  expect(t.history.at(-1)).toContain('left out tests/.env: the name looks like a secret')
  expect(told).toContain('left out tests/.env: the name looks like a secret, so it was not committed or merged')
  // the merge removes the task's folder (worktree remove --force deletes untracked files), so the file is moved out first, and the text says where
  expect(w.calls).toContain(`mkdir -p -m 700 ${ROOT}/.symcc/left-out`)
  expect(w.files.get(`${ROOT}/.symcc/left-out/T-1/tests/.env`)).toBe('contents of tests/.env')
  expect(w.files.has(`${WT}/tests/.env`)).toBe(false)
  expect(w.files.get(`${ROOT}/.symcc/left-out/.gitignore`)).toBe('*\n')
  expect(told).toContain("(moved to .symcc/left-out/T-1/, since the task's folder is removed after the merge)")
  expect(t.history.at(-1)).not.toContain("still in the task's folder")
})

test('*.pem, *.key and id_rsa files are left out the same way; id_rsa.pub is not', async () => {
  const { w, restored, t, told } = await finishedWithSecrets(['src/a.ts', 'tests/cert.pem', 'tests/server.key', 'tests/id_rsa', 'tests/id_rsa.pub'])
  expect(t.status).toBe('done')
  expect(restored.sort()).toEqual(['tests/cert.pem', 'tests/id_rsa', 'tests/server.key'])
  expect(w.git.changed).toEqual(['src/a.ts', 'tests/id_rsa.pub'])
  expect(w.git.main).toBe(H1)
  expect(told).toContain('left out tests/cert.pem, tests/id_rsa, tests/server.key')
  expect(t.history.at(-1)).toContain('left out tests/cert.pem, tests/id_rsa, tests/server.key: the name looks like a secret')
})

test('a change to a tracked .env.example (a template, not a secret) merges like any file', async () => {
  const { w, restored, t, told } = await finishedWithSecrets(['src/a.ts', 'tests/.env.example', 'tests/config/.env.defaults'])
  expect(t.status).toBe('done')
  expect(restored).toEqual([])
  expect(w.git.changed).toEqual(['src/a.ts', 'tests/.env.example', 'tests/config/.env.defaults'])
  expect(w.git.main).toBe(H1)
  expect(told).not.toContain('left out')
  expect(t.history.at(-1)).not.toContain('left out')
})

test('a secret-looking file the worker already committed is taken out of the branch before it merges', async () => {
  const { w, restored, t, told } = await finishedWithSecrets(['src/a.ts', 'tests/.env'], true)
  expect(t.status).toBe('done')
  // the branch goes back to the merge base with its work staged, the file is taken out, the rest is committed again
  const reset = w.calls.findIndex(c => c === `wt: git reset -q --soft ${M1}`)
  expect(reset).toBeGreaterThan(-1)
  expect(w.calls.findIndex(c => c.startsWith('wt: git restore --staged'))).toBeGreaterThan(reset)
  expect(restored).toEqual(['tests/.env'])
  expect(w.git.changed).toEqual(['src/a.ts'])
  expect(w.git.main).toBe(w.git.head)
  expect(told).toContain('left out tests/.env')
})

test('a change with only .env.local does not merge: the task waits for the owner with a question', async () => {
  const { w, t, told } = await finishedWithSecrets(['tests/.env.local'])
  expect(movedMain(w)).toBe(false)
  expect(ranTests(w)).toEqual([])
  expect(t.status).toBe('waiting')
  expect(t.question).toContain('changed only files whose names look like secrets (tests/.env.local)')
  expect(t.history.at(-1)).toContain('left out tests/.env.local')
  expect(told).toContain('tests/.env.local')
  // nothing merged, so the folder stays and the file stays in it
  expect(w.files.get(`${WT}/tests/.env.local`)).toBe('contents of tests/.env.local')
  expect(w.calls.some(c => c.includes('left-out'))).toBe(false)
})

test('a try whose earlier try already merged is done, even with a left-out secret still in its folder', async () => {
  const w = world({ dirty: false, head: H1, changed: [], answer: (args, cwd) => {
    if (args[0] === 'log' && args.at(-1) === H1) return ok(t1Commit(1))
    if (cwd === WT && args[0] === 'diff' && args.includes('--cached')) return ok('tests/.env')
    if (cwd === WT && args[0] === 'restore') return ok()
    return undefined
  } })
  w.put(`${WT}/tests/.env`, 'S')
  const [b, t] = boardWith('auto', [], { attempts: 2, files: ['src/', 'tests/'] })
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r.ok).toBe(true)
  expect(r.ask).toBeUndefined()
  expect(r.merged).toBe(H1)
  expect(r.detail).toMatch(/^already merged into main/)
  expect(r.detail).toContain('left out tests/.env')
  expect(w.files.get(`${ROOT}/.symcc/left-out/T-1/tests/.env`)).toBe('S')
})

test('deleting a tracked secret-looking file is allowed: the deletion is committed and merged', async () => {
  // main tracks tests/.env; the worker ran git rm tests/.env
  const { w, restored, t, told } = await finishedWithSecrets(['tests/.env'], false, { deleted: ['tests/.env'] })
  expect(t.status).toBe('done')
  expect(t.question ?? undefined).toBeUndefined()
  expect(restored).toEqual([])
  expect(movedMain(w)).toBe(true)
  expect(w.git.main).toBe(H1)
  expect(told).not.toContain('left out')
  expect(t.history.at(-1)).not.toContain('left out')
})

test('a deletion of a secret-looking file the worker committed is not put back by taking secrets out of the branch', async () => {
  const { w, restored, t } = await finishedWithSecrets(['src/a.ts', 'tests/server.key'], true, { deleted: ['tests/server.key'] })
  expect(t.status).toBe('done')
  expect(restored).toEqual([])
  // no rewrite of the branch: the deletion stays in its commit and merges
  expect(w.calls.some(c => c.includes(' reset '))).toBe(false)
  expect(w.git.main).toBe(w.git.head)
})

test('a secret the worker committed and then deleted in a later commit is taken out of the history that merges', async () => {
  // the branch: commit tests/id_rsa, git rm it, commit src/a.ts; the net change is src/a.ts only
  const { w, restored, t } = await finishedWithSecrets(['src/a.ts'], true, { history: ['src/a.ts', 'tests/id_rsa'] })
  expect(t.status).toBe('done')
  // the branch is made one commit again from the merge base, so the commit holding the key never reaches main
  const reset = w.calls.findIndex(c => c === `wt: git reset -q --soft ${M1}`)
  expect(reset).toBeGreaterThan(-1)
  const commit = w.calls.findIndex((c, i) => i > reset && c.startsWith('wt: git ') && c.includes(' commit '))
  expect(commit).toBeGreaterThan(reset)
  // nothing to take out of the new commit: the file is gone already, and nothing is put back
  expect(restored).toEqual([])
  expect(w.git.changed).toEqual(['src/a.ts'])
  expect(w.git.main).toBe(w.git.head)
})

// ---- T-507: a failing git step while secret-looking files are kept out: nothing merges, the task fails, its folder stays ----

/** Makes the fake git answer `f` first (undefined: the fake's own answer, secretWorld's included). */
const failFirst = (w: ReturnType<typeof world>, f: (args: string[], cwd: string) => Res | undefined) => {
  const before = w.git.answer
  w.git.answer = (args, cwd) => f(args, cwd) ?? before?.(args, cwd)
}
const commitCalls = (w: ReturnType<typeof world>) => w.calls.filter(c => c.startsWith('wt: git ') && c.includes(' commit '))
const GPG = 'error: gpg failed to sign the data'
const LOCKED = "fatal: Unable to create '/repo/.git/index.lock': File exists."

test('T-507: a committed secret that cannot be recommitted without it (signing fails) fails the task: nothing merges, no tests run, the folder is kept', async () => {
  const { w, t, told } = await finishedWithSecrets(['src/a.ts', 'tests/.env'], true, {
    // the worker committed everything itself: nothing is staged, so symcc's first commit has nothing to commit;
    // the recommit after the reset has work staged, and signing it fails
    prep: w => {
      w.git.dirty = false
      failFirst(w, a => (a.includes('commit') && w.git.dirty ? fail(`${GPG}\nfatal: failed to write commit object`, 128) : undefined))
    },
  })
  expect(w.calls).toContain(`wt: git reset -q --soft ${M1}`)
  expect(movedMain(w)).toBe(false)
  expect(w.git.main).toBe(M1)
  expect(ranTests(w)).toEqual([])
  expect(t.status).toBe('failed')
  expect(w.calls.some(c => c.includes('worktree remove'))).toBe(false)
  expect(w.files.get(`${WT}/tests/.env`)).toBe('contents of tests/.env')
  const why = `symcc could not take files that look like secrets out of the task's branch (tests/.env): ${GPG}`
  expect(t.history.join('\n')).toContain(why)
  expect(told).toContain(why)
})

test('T-507: checkAndMerge names git\'s signing error and the gpgsign hint when the recommit without a committed secret fails', async () => {
  const { w } = secretWorld(['src/a.ts', 'tests/.env'], true)
  w.git.dirty = false
  failFirst(w, a => (a.includes('commit') && w.git.dirty ? fail(GPG, 128) : undefined))
  const [b, t] = boardWith('auto', ['npm test'], { files: ['src/', 'tests/'] })
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r.ok).toBe(false)
  expect(r.detail.startsWith(`symcc could not take files that look like secrets out of the task's branch (tests/.env): ${GPG}`)).toBe(true)
  expect(r.detail).toContain('git config commit.gpgsign false')
  expect(r.merged).toBeUndefined()
  expect(movedMain(w)).toBe(false)
  expect(ranTests(w)).toEqual([])
})

test('T-507: when the reset that takes a committed secret out fails, checkAndMerge gives git\'s error, unstages nothing and merges nothing', async () => {
  const { w, restored } = secretWorld(['src/a.ts', 'tests/.env'], true)
  failFirst(w, a => (a[0] === 'reset' ? fail(LOCKED, 128) : undefined))
  const [b, t] = boardWith('auto', ['npm test'], { files: ['src/', 'tests/'] })
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r.ok).toBe(false)
  expect(r.detail).toBe(`symcc could not take files that look like secrets out of the task's branch (tests/.env): ${LOCKED}`)
  const reset = w.calls.indexOf(`wt: git reset -q --soft ${M1}`)
  expect(reset).toBeGreaterThan(-1)
  expect(w.calls.slice(reset).some(c => c.includes('restore --staged'))).toBe(false)
  expect(restored).toEqual([])
  expect(movedMain(w)).toBe(false)
  expect(ranTests(w)).toEqual([])
})

test('T-507: when unstaging an uncommitted secret fails, checkAndMerge gives git\'s error and commits nothing', async () => {
  const { w } = secretWorld(['src/a.ts', 'tests/.env'])
  failFirst(w, (a, cwd) => (cwd === WT && a[0] === 'restore' && a.includes('--staged') ? fail(LOCKED, 128) : undefined))
  const [b, t] = boardWith('auto', ['npm test'], { files: ['src/', 'tests/'] })
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r).toEqual({ ok: false, detail: `symcc could not leave out files that look like secrets (tests/.env): ${LOCKED}` })
  expect(commitCalls(w)).toEqual([])
  expect(movedMain(w)).toBe(false)
  expect(ranTests(w)).toEqual([])
})

test('T-507: when git diff --cached fails, checkAndMerge says it could not list the staged work and commits nothing', async () => {
  const { w } = secretWorld(['src/a.ts', 'tests/.env'])
  failFirst(w, (a, cwd) => (cwd === WT && a[0] === 'diff' && a.includes('--cached') ? fail('fatal: index file corrupt', 128) : undefined))
  const [b, t] = boardWith('auto', ['npm test'], { files: ['src/', 'tests/'] })
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r.ok).toBe(false)
  expect(r.detail.startsWith('symcc could not list the staged work (git diff --cached):')).toBe(true)
  expect(r.detail).toContain('fatal: index file corrupt')
  expect(commitCalls(w)).toEqual([])
  expect(movedMain(w)).toBe(false)
})

test('T-507: when unstaging the worker\'s .scratch/ folder fails, checkAndMerge gives git\'s error and commits nothing', async () => {
  const w = world({
    answer: (a, cwd) => {
      if (cwd === WT && a[0] === 'diff' && a.includes('--cached')) return ok(['src/a.ts', 'src/a.test.ts', '.scratch/edit.py'].join('\0'))
      if (cwd === WT && a[0] === 'restore' && a.includes('--staged')) return fail(LOCKED, 128)
      return undefined
    },
  })
  const [b, t] = boardWith('auto', ['npm test'])
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r).toEqual({ ok: false, detail: `symcc could not leave out the worker's .scratch/ folder: ${LOCKED}` })
  expect(w.calls).toContain('wt: git restore --staged -- :(literal).scratch/edit.py')
  expect(commitCalls(w)).toEqual([])
  expect(movedMain(w)).toBe(false)
  expect(ranTests(w)).toEqual([])
})

test('a branch whose commits never held a secret-looking file is not rewritten', async () => {
  const { w, t } = await finishedWithSecrets(['src/a.ts'], true, { history: ['src/a.ts', 'tests/id_rsa.pub'] })
  expect(t.status).toBe('done')
  expect(w.calls.some(c => c.includes(' reset '))).toBe(false)
})

test('only secret-looking files: one question to the lead, and no "not used" line in the history', async () => {
  const { t } = await finishedWithSecrets(['tests/.env.local'])
  expect(t.status).toBe('waiting')
  expect(t.history.some(l => l.includes('not used'))).toBe(false)
  expect(t.history.filter(l => l.includes('left out tests/.env.local'))).toHaveLength(1)
  expect(leadQueue.filter(m => m.includes('tests/.env.local'))).toHaveLength(1)
  expect(leadQueue.join('\n')).toContain('waits for the owner')
})

test('review mode: a left-out secret in the folder is not the owner\'s edit, not in the diff, and approve says nothing about owner edits', async () => {
  const { w, restored, t, told } = await finishedWithSecrets(['src/a.ts', 'tests/.env.local'], false, { mode: 'review' })
  expect(t.status).toBe('review')
  expect(restored).toEqual(['tests/.env.local'])
  expect(t.history.at(-1)).toContain("left out tests/.env.local: the name looks like a secret, so it was not committed or merged (still in the task's folder)")
  expect(told).toContain('left out tests/.env.local')
  // the file is still in the folder, untracked, as real git shows it
  expect(w.files.get(`${WT}/tests/.env.local`)).toBe('contents of tests/.env.local')
  w.git.wtStatus = '?? tests/.env.local\0'
  const cur = find(await load(w.$), 'T-1')!
  expect(await ownerEdits(w.$, cur, WT)).toEqual([])
  w.calls.length = 0
  await changesText(w.$, 'main', cur)
  expect(w.calls.some(c => c.includes('add -N'))).toBe(false)
  expect(w.calls.some(c => c.startsWith('wt: git diff'))).toBe(false)
  const before = ranTests(w).length
  await runTool(w.$, 'approve', { task: 'T-1' })
  const done = find(await load(w.$), 'T-1')!
  expect(done.status).toBe('done')
  expect(done.history.some(l => l.includes('owner edited'))).toBe(false)
  // no edits, and main did not move: no retest
  expect(ranTests(w).length).toBe(before)
})

test('review mode: the diff of real owner edits leaves out the secret-looking files in the folder', async () => {
  const w = await inReview({ wtStatus: ' M src/a.ts\0?? tests/.env.local\0?? src/b.md\0' })
  const cur = find(await load(w.$), 'T-1')!
  expect(await ownerEdits(w.$, cur, WT)).toEqual(['src/a.ts', 'src/b.md'])
  await changesText(w.$, 'main', cur)
  expect(w.calls).toContain('wt: git add -N -- src/b.md')
  expect(w.calls).toContain(`wt: git diff --no-color --no-ext-diff --no-renames ${M1} -- :(exclude,literal)tests/.env.local`)
})

test('the owner deleting a secret-looking file in review still counts as an edit', async () => {
  const w = await inReview({ wtStatus: ' D tests/.env\0' })
  expect(await ownerEdits(w.$, find(await load(w.$), 'T-1')!, WT)).toEqual(['tests/.env'])
})

test('only plain relative paths are moved out of the folder', () => {
  expect(isPlainRelPath('tests/.env')).toBe(true)
  for (const bad of ['', '/etc/passwd', '../.env', 'a/../../.env', 'a/./.env', 'a//.env', 'a\\..\\.env', 'a\0b']) expect(isPlainRelPath(bad)).toBe(false)
})

test('checkAndMerge with no secret-looking file leaves nothing out and says nothing about secrets', async () => {
  const { w, restored } = secretWorld(['src/a.ts', 'tests/a.test.ts'])
  const [b, t] = boardWith('auto', ['npm test'], { files: ['src/', 'tests/'] })
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r).toEqual({ ok: true, merged: H1, detail: `merged into main (${H1.slice(0, 8)}); tests passed` })
  expect(restored).toEqual([])
  expect(w.calls.some(c => c.includes(' reset '))).toBe(false)
})

test('tests_with_changes off: a code change with no test file merges with nothing said about tests', async () => {
  const { w, t, told } = await finishedWith(['src/a.ts'], 'off')
  expect(t.status).toBe('done')
  expect(w.git.main).toBe(H1)
  expect(told).not.toContain('no test')
})

test('a docs-only change is never flagged, whatever tests_with_changes says', async () => {
  for (const flag of ['ask', 'review'] as const) {
    const { w, t, told } = await finishedWith(['src/README.md', 'src/notes.md'], flag)
    expect(t.status).toBe('done')
    expect(w.git.main).toBe(H1)
    expect(told).not.toContain('no test')
  }
  expect(untestedChange(['README.md', 'docs/guide.md', 'CHANGELOG.md'])).toBe(false)
})

test('a change with a test file is never flagged', async () => {
  for (const flag of ['ask', 'review'] as const) {
    const { t, told } = await finishedWith(['src/a.ts', 'src/a.test.ts'], flag)
    expect(t.status).toBe('done')
    expect(told).not.toContain('no test')
  }
  for (const f of ['tests/a.ts', 'test/b.js', 'src/__tests__/c.ts', 'src/c.spec.ts']) expect(untestedChange(['src/x.ts', f])).toBe(false)
  expect(untestedChange(['src/x.ts', 'docs/a.md'])).toBe(true)
})

test('only real test and docs files count, not names that just contain the letters', () => {
  for (const f of ['src/latest.ts', 'hooks/plugin/inspect.ts', 'src/special.ts', 'src/attestation.ts', 'src/contest.py', 'scripts/run-tests.sh', 'src/readme_parser.ts', 'docs/build.ts']) expect(untestedChange([f])).toBe(true)
  for (const f of ['src/a.test.ts', 'src/a_test.py', 'src/test_a.py', 'src/c.spec.ts', 'tests/x.ts', 'spec/y.rb']) expect(untestedChange([f])).toBe(false)
  for (const f of ['README.md', 'README', 'LICENSE', 'CHANGELOG.txt', 'docs/guide.mdx']) expect(untestedChange([f])).toBe(false)
  expect(untestedChange(['src/latest.ts', 'src/a.test.ts'])).toBe(false)
})

test('images, video, subtitles and non-code files under docs/ are not code', () => {
  for (const f of ['docs/architecture.svg', 'docs/video/symcc.mp4', 'docs/video/symcc_youtube.srt', 'docs/video/demo.gif', 'assets/logo.png', 'docs/notes.txt']) expect(untestedChange([f])).toBe(false)
  for (const f of ['docs/build.ts', 'src/latest.ts', 'src/readme_parser.ts', 'docs/scripts/make.py']) expect(untestedChange([f])).toBe(true)
  expect(untestedChange(['assets/logo.png', 'src/x.ts'])).toBe(true)
})

test('code with a docs-style name (Notice.tsx, license.ts) is still code', () => {
  for (const f of ['src/components/Notice.tsx', 'src/license.ts', 'lib/authors.py', 'src/changelog.ts', 'hooks/core/contributing.js']) expect(untestedChange([f])).toBe(true)
  for (const f of ['README', 'README.md', 'README.txt', 'LICENSE', 'CHANGELOG.txt', 'NOTICE', 'docs/guide.mdx', 'CONTRIBUTING.rst', 'COPYING']) expect(untestedChange([f])).toBe(false)
})

test('dash, CamelCase, .Tests, Cypress and e2e test names count as tests', () => {
  for (const f of ['src/a-test.ts', 'src/a-spec.ts', 'src/FooTest.java', 'Foo.Tests/FooTests.cs', 'Foo.Test/Bar.cs', 'cypress/e2e/a.cy.ts', 'src/a.cy.js', 'e2e/login.ts', 'src/Test.java']) expect(isTestFile(f)).toBe(true)
  for (const f of ['src/latest.ts', 'src/Contest.py', 'src/inspect.ts', 'scripts/run-tests.sh', 'src/LATEST.ts', 'src/Attestation.java', 'src/protest-x.ts']) expect(isTestFile(f)).toBe(false)
  expect(untestedChange(['src/Foo.java', 'src/FooTest.java'])).toBe(false)
})

test('UITests / APITests-style names and an e2e name part count as tests', () => {
  for (const f of ['MyAppUITests/LoginUITests.swift', 'src/APITests.ts', 'src/IOTest.java', 'src/ABTest.java', 'src/login.e2e.ts', 'src/login_e2e.py', 'src/login-e2e.ts']) expect(isTestFile(f)).toBe(true)
  for (const f of ['src/latest.ts', 'src/Contest.py', 'src/inspect.ts', 'scripts/run-tests.sh', 'src/LATEST.ts', 'src/LOGINTEST.ts', 'src/e2etools.ts']) expect(isTestFile(f)).toBe(false)
  expect(untestedChange(['MyApp/Login.swift', 'MyAppUITests/LoginUITests.swift'])).toBe(false)
})

// ---------------- approve and reject ----------------

/** A world where T-1 waits in review: its work is committed (h1) in its worktree and the board is saved. */
async function inReview(g: Partial<Git> = {}, tests: Record<string, Res> = {}, test_commands = ['npm test'], extra: Partial<BoardTask> = {}) {
  const w = world({ dirty: false, head: H1, ...g }, tests)
  const [b] = boardWith('review', test_commands, extra)
  await saveBoard(w.$, patchTask(b, 'T-1', { status: 'review', note: 'ready for review' }, ISO))
  w.put(`${WT}/.git`, 'gitdir: x')
  return w
}

test('approve merges a task in review, without running the tests again when main did not move', async () => {
  const w = await inReview()
  const out = await runTool(w.$, 'approve', { task: 'T-1' })
  expect(out).toBe(`T-1 approved and merged: merged into main (${H1.slice(0, 8)}); approved by the owner`)
  expect(w.git.main).toBe(H1)
  expect(ranTests(w)).toEqual([])
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.merged).toBe(H1)
  // its folder and branch are cleaned up
  expect(w.calls).toContain(`root: git worktree remove --force ${WT}`)
  expect(w.calls).toContain(`root: git update-ref -d refs/heads/symcc/T-1 ${TIP}`)
})

// T-493: `git branch -d` checked the owner's HEAD, not the branch the task merged into, so a task merged into a branch
// that isn't checked out (here main, while the owner is on "other") kept its branch.
test('after a merge into a branch that is not checked out, the task branch is deleted when its work is in that branch', async () => {
  const w = await inReview({ current: 'other' })
  await runTool(w.$, 'approve', { task: 'T-1' })
  expect(find(await load(w.$), 'T-1')!.status).toBe('done')
  expect(w.calls).toContain(`root: git merge-base --is-ancestor ${TIP} refs/heads/main`)
  expect(w.calls).toContain(`root: git update-ref -d refs/heads/symcc/T-1 ${TIP}`)
  expect(w.calls.some(c => c.includes('git branch -d'))).toBe(false)
})

test('after a merge, a task branch with work not in its target is kept', async () => {
  const w = await inReview({ tipMerged: false })
  await runTool(w.$, 'approve', { task: 'T-1' })
  expect(find(await load(w.$), 'T-1')!.status).toBe('done')
  expect(w.calls.some(c => c.includes('update-ref -d'))).toBe(false)
})

/** A world with T-1 done (merged into main) and its branch left over, as the regular check (cleanupMerged) finds it. */
async function leftOver(g: Partial<Git> = {}) {
  const w = world({ dirty: false, head: H1, current: 'other', ...g, answer: (args, cwd) => (args[0] === 'branch' && args[1] === '--merged' ? ok('main\nsymcc/T-1\nother') : g.answer?.(args, cwd)) })
  const [b] = boardWith('auto')
  const done = patchTask(b, 'T-1', { status: 'done', merged: H1 }, ISO)
  await saveBoard(w.$, done)
  return { w, b: done }
}

test('the regular check deletes a merged task branch whose target is not checked out', async () => {
  const { w, b } = await leftOver()
  await cleanupMerged(w.$, b)
  expect(w.calls).toContain(`root: git merge-base --is-ancestor ${TIP} refs/heads/main`)
  expect(w.calls).toContain(`root: git update-ref -d refs/heads/symcc/T-1 ${TIP}`)
  expect(w.calls.some(c => c.includes('git branch -d'))).toBe(false)
})

test('the regular check keeps a task branch with work not in its target, or one still checked out in a folder', async () => {
  const notIn = await leftOver({ tipMerged: false })
  await cleanupMerged(notIn.w.$, notIn.b)
  expect(notIn.w.calls.some(c => c.includes('update-ref -d'))).toBe(false)
  const out = await leftOver({ answer: args => (args[0] === 'worktree' && args[1] === 'list' ? ok(`worktree ${WT}\nHEAD ${TIP}\nbranch refs/heads/symcc/T-1\n`) : undefined) })
  await cleanupMerged(out.w.$, out.b)
  expect(out.w.calls.some(c => c.includes('update-ref -d'))).toBe(false)
})

test('a task branch that moved after the check is not deleted', async () => {
  // the branch is read at TIP and found merged, but by the delete it points elsewhere: update-ref -d with the old tip refuses
  const w = world({ dirty: false, head: H1 })
  const moved = { tip: TIP, answer: (args: string[]) => (args[0] === 'update-ref' && args[1] === '-d' ? fail("cannot lock ref 'refs/heads/symcc/T-1'") : undefined) }
  Object.assign(w.git, moved)
  expect(await deleteMergedBranch(w.$, 'symcc/T-1', 'main')).toBe(false)
  expect(w.calls).toContain(`root: git update-ref -d refs/heads/symcc/T-1 ${TIP}`)
})

test('approve when main moved runs the tests again; failing, nothing merges and the task gets a new try', async () => {
  const w = await inReview({ upToDate: false }, { 'npm test': { exitCode: 1, stdout: 'FAIL a.test', stderr: '' } })
  const out = await runTool(w.$, 'approve', { task: 'T-1' })
  expect(out).toBe('T-1 approved, but not merged: tests failed: `npm test` (exit 1). FAIL a.test (see the board for what happens next)')
  expect(w.git.main).toBe(M1)
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('todo')
  expect(t.test_tries).toBe(1)
  expect(t.test_output).toContain('FAIL a.test')
})

test('approve that is blocked by the owner\'s uncommitted changes in a file it changes keeps the task in review, waiting for that file', async () => {
  const w = await inReview({ current: 'main', status: ' M src/a.ts\0' })
  const out = await runTool(w.$, 'approve', { task: 'T-1' })
  expect(out).toBe('T-1 was not merged and stays in review: you have uncommitted changes on main to files T-1 changes (src/a.ts); commit or stash them, and T-1 merges on its own at the next check.')
  expect(out).not.toContain('retry')
  let t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('review')
  expect(t.note).toBe('waiting for your files on main: src/a.ts; commit or stash them')
  expect((t as BoardTask).merge_wait).toEqual({ dirty: ['src/a.ts'], untracked: [], ignored: [] })
  expect(w.git.main).toBe(M1)
  // once the file is committed, approving again only merges it
  w.git.status = ''
  expect(await runTool(w.$, 'approve', { task: 'T-1' })).toBe(`T-1 approved and merged: merged into main (${H1.slice(0, 8)}); approved by the owner`)
  t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect((t as BoardTask).merge_wait).toBeUndefined()
})

test('approve with no edits since review adds no "owner edited" line', async () => {
  const w = await inReview({}, {}, ['npm test'], { runs: [{ started: ISO, commits: [H1] }] })
  await runTool(w.$, 'approve', { task: 'T-1' })
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(ranTests(w)).toEqual([])
  expect(t.history.some(l => l.includes('owner edited'))).toBe(false)
})

test('approve after the owner edited files in the folder runs the tests again and commits the edits with the task', async () => {
  const w = await inReview({ dirty: true, wtStatus: ' M src/a.ts\0?? src/b.md\0' }, {}, ['npm test'], { runs: [{ started: ISO, commits: [H1] }] })
  const out = await runTool(w.$, 'approve', { task: 'T-1' })
  expect(out).toBe(`T-1 approved and merged: merged into main (${H3.slice(0, 8)}); approved by the owner; tests passed`)
  expect(ranTests(w)).toEqual(['/bin/sh -c npm test'])
  expect(w.git.main).toBe(H3)
  // committed in the task's folder with the task's own message (and trailers)
  const commit = w.calls.find(c => c.startsWith('wt: git ') && c.includes(' commit '))!
  expect(commit).toContain('T-1: Do it')
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.merged).toBe(H3)
  expect(t.history).toContain('owner edited files before approving: src/a.ts, src/b.md')
})

test('a typed "cd web && npm test" is one test command, run as one shell line in the task\'s folder', async () => {
  const r = parseSettingValue('test_commands', '"cd web && npm test"')
  expect(r).toEqual({ ok: true, input: { test_commands: ['cd web && npm test'] } })
  const cmds = commandsOf(r)
  const w = await inReview({ upToDate: false }, {}, cmds)
  const runs: { argv: string[]; cwd?: string }[] = []
  const fake = w.$
  const run = fake.run
  fake.run = (argv, o) => (argv[0] === '/bin/sh' && runs.push({ argv: [...argv], cwd: o?.cwd }), run(argv, o))
  await runTool(w.$, 'approve', { task: 'T-1' })
  // one shell runs the whole line, so the cd takes effect for npm test
  expect(runs).toEqual([{ argv: ['/bin/sh', '-c', 'cd web && npm test'], cwd: WT }])
})

test('a commit of the owner newer than the reviewed one also makes approve run the tests again', async () => {
  const w = await inReview({ head: H3, answer: (a, cwd) => (cwd === WT && a[0] === 'diff' && a.includes(`${H1}..${H3}`) ? ok('src/c.ts\0') : undefined) }, {}, ['npm test'], { runs: [{ started: ISO, commits: [H1] }] })
  await runTool(w.$, 'approve', { task: 'T-1' })
  expect(ranTests(w)).toEqual(['/bin/sh -c npm test'])
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.history).toContain('owner edited files before approving: src/c.ts')
})

test('approve whose edits fail the tests keeps the task in review with the output; approving again tests again', async () => {
  const tests = { 'npm test': { exitCode: 1, stdout: 'FAIL b.test', stderr: '' } }
  const w = await inReview({ dirty: true, wtStatus: ' M src/a.ts\0' }, tests, ['npm test'], { runs: [{ started: ISO, commits: [H1] }] })
  const out = await runTool(w.$, 'approve', { task: 'T-1' })
  expect(out).toBe('T-1 was not merged and stays in review: tests failed: `npm test` (exit 1). FAIL b.test. Fix the files in .symcc/worktrees/T-1, then approve it again (the tests run again).')
  expect(w.git.main).toBe(M1)
  let t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('review')
  expect(t.test_tries ?? 0).toBe(0)
  expect(t.test_output).toContain('FAIL b.test')
  expect(t.note).toMatch(/^approved, but your edits fail the tests/)
  // the edits are committed now (and saved as the task's newest commit); a second approve still tests them
  expect(t.runs!.at(-1)!.commits).toEqual([H1, H3])
  tests['npm test'] = ok()
  const again = await runTool(w.$, 'approve', { task: 'T-1' })
  expect(again).toBe(`T-1 approved and merged: merged into main (${H3.slice(0, 8)}); approved by the owner; tests passed`)
  expect(ranTests(w)).toEqual(['/bin/sh -c npm test', '/bin/sh -c npm test'])
  t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.test_output).toBeUndefined()
})

test('approve with an owner edit outside the task keeps the edit and the task in review; once the file is allowed, approving again merges it', async () => {
  // the owner edited docs/x.md (outside the task's src/) in the task's folder
  const w = await inReview({ dirty: true, wtStatus: ' M docs/x.md\0', changed: ['src/a.ts', 'docs/x.md'] }, {}, ['npm test'], { runs: [{ started: ISO, commits: [H1] }] })
  const out = await runTool(w.$, 'approve', { task: 'T-1' })
  expect(out).toBe(`T-1 was not merged and stays in review: ${outOfScopeText(['docs/x.md'], ['src/'])}.`)
  expect(out).toBe("T-1 was not merged and stays in review: changed files outside the task (docs/x.md); allowed: src/. To fix: add them to files with change, or split the task. Adding them with change sends the task back to work with these edits kept, and it comes back to review, where you approve it again.")
  // nothing was undone: no restore, no undo commit; the edit is committed on the branch and still in the folder
  expect(w.calls.some(c => c.startsWith('wt: git restore'))).toBe(false)
  expect(w.calls.some(c => c.includes('undo changes outside the task'))).toBe(false)
  expect(w.git.head).toBe(H3)
  expect(w.git.changed).toEqual(['src/a.ts', 'docs/x.md'])
  expect(w.git.main).toBe(M1)
  let t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('review')
  expect(t.note).toMatch(/^approved, but not merged: changed files outside the task/)
  // the owner allows the file (the task's files now include it; it stays in review), then approves again: the edit merges
  await saveBoard(w.$, patchTask(await load(w.$), 'T-1', { files: ['src/', 'docs/x.md'] }, ISO))
  const again = await runTool(w.$, 'approve', { task: 'T-1' })
  expect(again).toContain('T-1 approved and merged: merged into main')
  expect(w.git.main).toBe(H3)
  t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.merged).toBe(H3)
})

test('the diff of a task in review shows its folder as it is now, with the owner\'s edits, and says so', async () => {
  const stat = ' src/a.ts | 3 ++-\n src/b.md | 2 ++\n 2 files changed, 4 insertions(+), 1 deletion(-)\n'
  const w = await inReview({
    wtStatus: ' M src/a.ts\0?? src/b.md\0',
    answer: (a, cwd) => {
      if (cwd !== WT || a[0] !== 'diff') return undefined
      if (a.some(x => x.startsWith('--stat'))) return ok(stat)
      return ok('diff --git a/src/b.md b/src/b.md\n+new line')
    },
  })
  const files = await changedFiles(w.$, 'main', find(await load(w.$), 'T-1')!)
  expect(files).toEqual([{ file: 'src/a.ts', added: 2, removed: 1, edited: true }, { file: 'src/b.md', added: 2, removed: 0, edited: true }])
  expect(statText('T-1', files).split('\n')[0]).toBe('T-1 changes 2 files (+4 -1) (includes your edits):')
  // the new file is marked to add, and the diff is of the folder against where it left main
  expect(w.calls).toContain('wt: git add -N -- src/b.md')
  expect(w.calls).toContain(`wt: git diff --no-color --no-ext-diff --no-renames --stat=1000,800 ${M1}`)
  const text = await changesText(w.$, 'main', find(await load(w.$), 'T-1')!, 'src/b.md')
  expect(text).toBe('(includes your edits)\ndiff --git a/src/b.md b/src/b.md\n+new line')
})

test('with no edits the diff of a task in review is its branch against main, as before', async () => {
  const w = await inReview()
  const text = await changesText(w.$, 'main', find(await load(w.$), 'T-1')!)
  expect(text).toBe('')
  expect(w.calls).toContain('root: git diff --no-color --no-ext-diff --no-renames main...symcc/T-1')
  expect(w.calls.some(c => c.startsWith('wt: git diff'))).toBe(false)
})

test('approve of a task that is not in review is refused and changes nothing', async () => {
  const w = world()
  await saveBoard(w.$, boardWith('review')[0])
  const before = w.files.get(BOARD)
  const err = await runTool(w.$, 'approve', { task: 'T-1' }).then(() => null, (e: Error) => e.message)
  expect(err).toBe('T-1 is not ready for review (it is doing); only a task in review can be approved')
  expect(w.files.get(BOARD)).toBe(before)
  expect(w.calls.some(c => / git /.test(c))).toBe(false)
})

test('reject sends a task in review back to "todo" with the reason, and merges nothing', async () => {
  const w = await inReview()
  const out = await runTool(w.$, 'reject', { task: 'T-1', reason: 'the name is wrong' })
  expect(out).toBe('T-1 rejected: back to "todo"; a fresh worker picks it up with the reason')
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('todo')
  expect(t.note).toBe('rejected: the name is wrong')
  expect(t.history.at(-1)).toBe('try 1: rejected by the owner: the name is wrong')
  // only looking: nothing committed, merged or moved
  expect(w.calls.filter(c => / git /.test(c))).toEqual(['root: git symbolic-ref --short -q refs/remotes/origin/HEAD', 'root: git symbolic-ref --short -q HEAD', 'root: git for-each-ref --format=%(refname:short) refs/heads'])
  expect(w.git.main).toBe(M1)
})

test('reject with no reason is refused and the task stays in review', async () => {
  const w = await inReview()
  const err = await runTool(w.$, 'reject', { task: 'T-1', reason: '  ' }).then(() => null, (e: Error) => e.message)
  expect(err).toBe('give a reason for rejecting, so the next worker knows what to fix')
  expect(find(await load(w.$), 'T-1')!.status).toBe('review')
})

// ---------------- other tools while a task is being approved ----------------

/** Approves T-1 (in review); `during` runs once, right after the first command that matches `when` (by default: moving main). */
async function approving(during: (w: ReturnType<typeof world>) => Promise<unknown>, when: RegExp = /git update-ref/) {
  const w = await inReview()
  let done = false
  const said: unknown[] = []
  let removedDuring = false
  w.onRun(async cmd => {
    if (done || !when.test(cmd)) return
    done = true
    said.push(await during(w).catch((e: Error) => `error: ${e.message}`))
    removedDuring = w.calls.some(c => c.includes('worktree remove'))
  })
  const out = await runTool(w.$, 'approve', { task: 'T-1' })
  return { w, out, said, removedDuring, t: find(await load(w.$), 'T-1')! }
}

test('reject, drop, retry, change and ask during an approve are refused; the merge goes on and the task ends done', async () => {
  const tries: [string, Record<string, unknown>][] = [
    ['reject', { task: 'T-1', reason: 'wrong' }],
    ['drop', { task: 'T-1' }],
    ['retry', { task: 'T-1' }],
    ['change', { task: 'T-1', title: 'Something else' }],
    ['ask', { task: 'T-1', question: 'more?' }],
  ]
  for (const [tool, args] of tries) {
    const { w, out, said, removedDuring, t } = await approving(w => runTool(w.$, tool, args), /git merge-base/)
    expect(String(said[0]).replace(/^error: /, '')).toBe('T-1 is being merged; wait a moment')
    expect(removedDuring).toBe(false)
    expect(out).toBe(`T-1 approved and merged: merged into main (${H1.slice(0, 8)}); approved by the owner`)
    expect(w.git.main).toBe(H1)
    expect(t.status).toBe('done')
    expect(t.title).toBe('Do it')
    expect(t.merged).toBe(H1)
  }
})

test('the folder of a task being approved is not removed until the approve is done with it', async () => {
  let removed: boolean | undefined
  const { w, t } = await approving(async w => {
    removed = await removeWorktree(w.$, 'T-1', WT)
  })
  expect(removed).toBe(false)
  expect(t.status).toBe('done')
  // only the approve's own cleanup, after the merge, removed it
  expect(w.calls.filter(c => c.includes('worktree remove --force'))).toEqual([`root: git worktree remove --force ${WT}`])
})

test('a merged approve always ends done with its merge commit, even when the task was paused meanwhile', async () => {
  const { w, out, t } = await approving(async w => {
    // the change comes too late: main has just moved
    await change(w.$, x => patchTask(x, 'T-1', { status: 'paused', note: 'paused' }, ISO))
  }, /git read-tree|git update-ref/)
  expect(w.git.main).toBe(H1)
  expect(out).toBe(`T-1 was merged into main (${H1.slice(0, 8)}) before it was paused; it is done`)
  expect(t.status).toBe('done')
  expect(t.merged).toBe(H1)
  expect(t.history.at(-1)).toBe('try 1: it was paused while being merged, too late: the work was already merged, so it stays done')
})

// ---------------- a task dropped, paused or changed while its work is checked ----------------

/**
 * A world where T-1's worker (agent ag1) has just finished, with `test_commands`; `during` runs once,
 * right after the first command that matches `when` (by default: the first test command).
 */
async function finishing(during: (w: ReturnType<typeof world>) => Promise<unknown>, tests: Record<string, Res> = {}, when: RegExp = /^\/bin\/sh -c /) {
  const w = world({}, tests)
  const [b] = boardWith('auto', ['npm test'], { history: ['created by the lead', 'try 1: an earlier line'] })
  await saveBoard(w.$, b)
  w.put(`${WT}/.git`, 'gitdir: x')
  let done = false
  const said: unknown[] = []
  w.onRun(async cmd => {
    if (done || !when.test(cmd)) return
    done = true
    said.push(await during(w).catch((e: Error) => `error: ${e.message}`))
  })
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  await workerFinished(w.$, 'ag1', 'made the change')
  return { w, said, t: find(await load(w.$), 'T-1')! }
}

test('a task dropped while its tests run is not merged, stays dropped, and its folder goes only after the check', async () => {
  let removedDuring = false
  const { w, said, t } = await finishing(async w => {
    const out = await runTool(w.$, 'drop', { task: 'T-1', reason: 'not needed' })
    removedDuring = w.calls.some(c => c.includes('worktree remove'))
    return out
  })
  expect(said[0]).toBe('T-1 dropped; T-1 is being tested and merged, so that stops before the merge (if the merge already happened, it stays done)')
  expect(removedDuring).toBe(false)
  expect(movedMain(w)).toBe(false)
  expect(w.git.main).toBe(M1)
  expect(t.status).toBe('dropped')
  expect(t.note).toBe('not needed')
  expect(t.history.slice(0, 2)).toEqual(['created by the lead', 'try 1: an earlier line'])
  expect(t.history.at(-1)).toMatch(/\(not used: the task was dropped meanwhile\)$/)
  expect(w.calls).toContain(`root: git worktree remove --force ${WT}`)
})

test('a task dropped while its tests fail does not go back to "todo" for a new try', async () => {
  const { w, t } = await finishing(w => runTool(w.$, 'drop', { task: 'T-1' }), { 'npm test': { exitCode: 1, stdout: 'FAIL a.test', stderr: '' } })
  expect(t.status).toBe('dropped')
  expect(t.test_tries ?? 0).toBe(0)
  expect(w.git.main).toBe(M1)
  expect(leadQueue.join('\n')).not.toMatch(/retrying/)
})

test('a task paused while its tests run is not merged and stays paused, its folder kept', async () => {
  const { w, said, t } = await finishing(w => runTool(w.$, 'pause', { task: 'T-1' }))
  expect(String(said[0])).toMatch(/^T-1 paused; T-1 is being tested and merged/)
  expect(t.status).toBe('paused')
  expect(w.git.main).toBe(M1)
  expect(w.calls.some(c => c.includes('worktree remove'))).toBe(false)
  expect(t.history.at(-1)).toMatch(/\(not used: the task was paused meanwhile\)$/)
})

test('a change while the task is being checked is refused, and the check goes on', async () => {
  const { w, said, t } = await finishing(w => runTool(w.$, 'change', { task: 'T-1', title: 'Something else' }))
  expect(said[0]).toBe('error: T-1 is being tested and merged; try again in a moment')
  expect(t.title).toBe('Do it')
  expect(t.status).toBe('done')
  expect(w.git.main).toBe(H1)
  expect(t.history.slice(0, 2)).toEqual(['created by the lead', 'try 1: an earlier line'])
})

/** T-440: from now on the fake git has no branch main (deleted by the owner): rev-parse of it fails as git does. */
const deleteMain = (w: ReturnType<typeof world>) => {
  w.git.answer = args => {
    const s = args.join(' ')
    if (s === 'rev-parse --verify -q refs/heads/main') return fail('', 1)
    if (s === 'rev-parse refs/heads/main') return fail("fatal: ambiguous argument 'refs/heads/main': unknown revision", 128)
    return undefined
  }
}

/** T-440: task `t` waits with the "branch main is gone" question, its work kept: not failed, no failed try counted. */
const waitsForGoneMain = (w: ReturnType<typeof world>, t: BoardTask) => {
  expect(t.status).toBe('waiting')
  expect(t.question).toMatch(/^branch main is gone: merge into \S+ instead\?$/)
  expect(t.history.at(-1)).toMatch(/^not merged: branch main is gone; asked the owner/)
  expect(t.test_tries ?? 0).toBe(0)
  expect(movedMain(w)).toBe(false)
  expect(w.calls.some(c => c.includes('worktree remove'))).toBe(false)
  expect(leadQueue.join('\n')).toMatch(/can't be merged: the branch it merges into, main, is gone/)
  expect(leadQueue.join('\n')).not.toMatch(/checking failed|was not merged/)
}

test('T-440: a target branch already gone when the worker hands back: the task waits with the branch-gone question', async () => {
  const w = world()
  deleteMain(w)
  const [b] = boardWith('auto', ['npm test'])
  await saveBoard(w.$, b)
  w.put(`${WT}/.git`, 'gitdir: x')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  await workerFinished(w.$, 'ag1', 'made the change')
  waitsForGoneMain(w, find(await load(w.$), 'T-1')!)
  expect(ranTests(w)).toEqual([])
})

test('T-440: a target branch deleted while the tests run: the task waits with the branch-gone question at merge, not failed', async () => {
  const { w, t } = await finishing(async w => deleteMain(w))
  // the tests did run; the branch went during them
  expect(ranTests(w)).toEqual(['/bin/sh -c npm test'])
  waitsForGoneMain(w, t)
})

test('T-440: a target branch deleted while an approve runs its tests: the task waits with the branch-gone question', async () => {
  // main moved since review, so the tests run again
  const w = await inReview({ upToDate: false })
  let done = false
  w.onRun(async cmd => {
    if (done || !/^\/bin\/sh -c /.test(cmd)) return
    done = true
    deleteMain(w)
  })
  const out = await runTool(w.$, 'approve', { task: 'T-1' })
  expect(String(out)).toMatch(/is gone; it now waits for your answer/)
  waitsForGoneMain(w, find(await load(w.$), 'T-1')!)
})

test('a drop seen only after the merge keeps the task done, with a line saying the drop came too late', async () => {
  const { w, t } = await finishing(w => runTool(w.$, 'drop', { task: 'T-1' }), {}, /git update-ref/)
  expect(w.git.main).toBe(H1)
  expect(t.status).toBe('done')
  expect(t.history.slice(0, 2)).toEqual(['created by the lead', 'try 1: an earlier line'])
  expect(t.history.at(-1)).toBe('try 1: it was dropped while being merged, too late: the work was already merged, so it stays done')
})

// ---------------- symcc or the board turned off while a task is being checked ----------------

/** Turns symcc off and gives back its reply; symcc is on again for the next test. */
async function turnOff(w: ReturnType<typeof world>) {
  try {
    return await setSymcc(w.$, false)
  } finally {
    S.enabledNow = true
  }
}

test('symcc turned off while a finished task\'s tests run: not merged, back to todo, files kept', async () => {
  const { w, said, t } = await finishing(turnOff)
  expect(String(said[0])).toMatch(/T-1 was being tested and merged and went back to todo/)
  expect(movedMain(w)).toBe(false)
  expect(w.git.main).toBe(M1)
  expect(t.status).toBe('todo')
  expect(t.note).toMatch(/symcc was turned off/)
  expect(t.history).toContain('try 1: stopped: symcc was turned off while its work was being checked; nothing merged, its files are kept')
  expect(t.history.at(-1)).toMatch(/\(not used: symcc was turned off\)$/)
  expect(w.calls.some(c => c.includes('worktree remove'))).toBe(false)
})

test('the board turned off while a finished task\'s tests run: not merged, back to todo', async () => {
  const { w, said, t } = await finishing(w => setBoardMode(w.$, 'off', 'you'))
  expect(String(said[0])).toMatch(/T-1 was being tested and merged and went back to todo/)
  expect(w.git.main).toBe(M1)
  expect(t.status).toBe('todo')
  expect(t.history).toContain('try 1: stopped: the board was turned off while its work was being checked; nothing merged, its files are kept')
})

test('symcc turned off during an approve: not merged, stays in review', async () => {
  const { w, out, said, t } = await approving(turnOff, /git merge-base/)
  expect(String(said[0])).toMatch(/T-1 was already merging and stayed in review/)
  expect(movedMain(w)).toBe(false)
  expect(w.git.main).toBe(M1)
  expect(out).toBe('T-1 was not merged and stays in review: symcc was turned off while it was being merged. Approve it again.')
  expect(t.status).toBe('review')
  expect(t.history.at(-1)).toBe('try 1: approved by the owner → not merged: symcc was turned off while it was being merged; it stays in review')
})

test('the board turned off during an approve: not merged, stays in review', async () => {
  const { w, said, t } = await approving(w => setBoardMode(w.$, 'off', 'you'), /git merge-base/)
  expect(String(said[0])).toMatch(/T-1 was already merging and stayed in review/)
  expect(w.git.main).toBe(M1)
  expect(t.status).toBe('review')
})

test('symcc turned off only after the merge keeps the task done, with a line saying the off came too late', async () => {
  const { w, t } = await finishing(turnOff, {}, /git update-ref/)
  expect(w.git.main).toBe(H1)
  expect(t.status).toBe('done')
  expect(t.history.at(-1)).toBe('try 1: symcc was turned off while it was being merged, too late: the work was already merged, so it stays done')
})

test('the board turned off only after an approve\'s merge keeps the task done, with a "too late" line', async () => {
  const { w, out, t } = await approving(w => setBoardMode(w.$, 'off', 'you'))
  expect(w.git.main).toBe(H1)
  expect(out).toBe(`T-1 was merged into main (${H1.slice(0, 8)}) before the board was turned off; it is done`)
  expect(t.status).toBe('done')
  expect(t.history.at(-1)).toBe('try 1: the board was turned off while it was being merged, too late: the work was already merged, so it stays done')
})

// ---------------- symcc or the board turned back on (T-213) ----------------

/**
 * A world where work can start: this session drives the board, startup is done, and agent.spawn is
 * recorded (each spawn gets a new agent id). The board is in auto mode with T-1 "doing" and a live worker (ag1).
 */
async function liveWorld() {
  const w = world()
  S.me = 'me'
  const spawned: string[] = []
  const x = w.$
  x.agents.spawn = async e => (spawned.push(String(e.name)), { agentId: `ag${spawned.length + 1}` })
  x.plugin = { name: 'symcc', root: '/plugin' }
  x.fs.list = async () => []
  const [b] = boardWith('auto', [], { session: 'me', agent: 'ag1', branch: 'symcc/T-1', history: [], runs: [{ started: ISO }] })
  await saveBoard(w.$, b)
  workers.clear()
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  S.startupDone = true
  S.driving = true
  return { w, spawned }
}

/** Lets the `void pump($)` started by setSymcc or setBoardMode run to its end (no clock: only promise turns). */
async function settle(w: ReturnType<typeof world>, done: () => boolean) {
  // a queued worker starts as at a turn's start or end (T-391)
  for (let i = 0; i < 5000 && !(done() && !w.files.has(LOCK)); i++) await (queuedStarts() ? drainStarts(w.$) : Promise.resolve())
  expect(done()).toBe(true)
  // a few more turns, so the board write that records the new agent has finished too
  for (let i = 0; i < 200; i++) await Promise.resolve()
}

const workerOn = (id: string) => [...workers.values()].some(x => x.task === id)

/** Puts the shared plugin state back as the other tests expect it. */
function cleanUp() {
  workers.clear()
  S.startupDone = false
  S.driving = false
  S.enabledNow = true
}

test('/symcc-off then /symcc-on: the reply names the mode, the lead is told once, and T-1 gets a new worker', async () => {
  const { w, spawned } = await liveWorld()
  try {
    await setSymcc(w.$, false)
    expect(find(await load(w.$), 'T-1')!.status).toBe('todo')
    expect(workerOn('T-1')).toBe(false)
    const on = await setSymcc(w.$, true)
    expect(on.startsWith('symcc is on, in mode auto')).toBe(true)
    await settle(w, () => workerOn('T-1'))
    expect(leadQueue.filter(m => m.includes('You are the lead again; the board is in mode auto')).length).toBe(1)
    expect(spawned.length).toBe(1)
    expect(spawned[0]).toContain('T-1')
    expect(find(await load(w.$), 'T-1')!.status).toBe('doing')
  } finally {
    cleanUp()
  }
})

test('/symcc-on when symcc is already on says "already on" and tells the lead nothing new', async () => {
  const { w, spawned } = await liveWorld()
  try {
    await setSymcc(w.$, false)
    await setSymcc(w.$, true)
    await settle(w, () => workerOn('T-1'))
    const told = leadQueue.length
    const again = await setSymcc(w.$, true)
    expect(again.startsWith('symcc is already on, in mode auto: ')).toBe(true)
    for (let i = 0; i < 200; i++) await Promise.resolve()
    expect(leadQueue.length).toBe(told)
    // T-1 already has its worker: no second one
    expect(spawned.length).toBe(1)
  } finally {
    cleanUp()
  }
})

// T-391: a worker's start waits in the queue until a turn starts or ends; the board says so honestly meanwhile
test('a queued worker: its task shows "starting at the next turn" and no agent until the queue is emptied, then "worker on it" with its agent', async () => {
  const { w, spawned } = await liveWorld()
  try {
    await setSymcc(w.$, false)
    await setSymcc(w.$, true)
    for (let i = 0; i < 5000 && (queuedStarts() === 0 || w.files.has(LOCK)); i++) await Promise.resolve()
    expect(queuedStarts()).toBe(1)
    const queued = find(await load(w.$), 'T-1')!
    expect(queued.status).toBe('doing')
    expect(queued.note).toBe('starting at the next turn')
    expect(spawned).toEqual([])
    expect(workerOn('T-1')).toBe(false)
    await drainStarts(w.$)
    await settle(w, () => workerOn('T-1'))
    const t = find(await load(w.$), 'T-1')!
    expect(spawned.length).toBe(1)
    expect(t.note).toBe('worker on it')
    expect(t.agent).toBe('ag2')
  } finally {
    cleanUp()
  }
})

test('a new worker gets the built-in change prompt even when a .symcc/prompts/change.md file exists', async () => {
  const { w } = await liveWorld()
  const prompts: string[] = []
  const x = w.$
  x.agents.spawn = async e => (prompts.push(String(e.prompt)), { agentId: `ag${prompts.length + 1}` })
  // a complete override, with every placeholder the old code needed, so old code would have used it (no warning path)
  w.put(`${ROOT}/.symcc/prompts/change.md`, 'MINE: {{details}}{{merge_main}}{{test_output}}\n{{ask}}\n')
  try {
    await setSymcc(w.$, false)
    await setSymcc(w.$, true)
    await settle(w, () => workerOn('T-1'))
    expect(prompts.length).toBe(1)
    expect(prompts[0]).not.toContain('MINE:')
    expect(prompts[0]).toContain('You are a symcc worker. Do exactly this one task, then stop.')
  } finally {
    cleanUp()
  }
})

// ---------------- retry and ask on dropped, done and clashed tasks ----------------

test('retry brings a dropped task back to "todo" on purpose, with a history line', async () => {
  const w = world()
  const [b] = boardWith('auto', [], { status: 'dropped', note: 'not needed', history: ['created by the lead'] })
  await saveBoard(w.$, b)
  const out = await runTool(w.$, 'retry', { task: 'T-1' })
  expect(out).toBe('T-1 brought back from dropped and queued')
  const t = find(await load(w.$), 'T-1')!
  expect(['todo', 'doing']).toContain(t.status)
  expect(t.history).toContain('brought back from dropped')
})

test('retry refuses a done task', async () => {
  const w = world()
  const [b] = boardWith('auto', [], { status: 'done' })
  await saveBoard(w.$, b)
  expect(await runTool(w.$, 'retry', { task: 'T-1' })).toBe('T-1 is already done')
  expect(find(await load(w.$), 'T-1')!.status).toBe('done')
})

test('ask refuses a done or dropped task and leaves it as it is', async () => {
  for (const status of ['done', 'dropped'] as const) {
    const w = world()
    const [b] = boardWith('auto', [], { status })
    await saveBoard(w.$, b)
    const err = await runTool(w.$, 'ask', { task: 'T-1', question: 'more?' }).then(() => null, (e: Error) => e.message)
    expect(err).toBe(`T-1 is ${status}; retry it first if it needs more work`)
    const t = find(await load(w.$), 'T-1')!
    expect(t.status).toBe(status)
    expect(t.question ?? null).toBe(null)
  }
})

test('a task dropped while its branch clashes with main does not go back to "todo" for a merge-main try', async () => {
  const w = world({ upToDate: false, conflict: true })
  const [b] = boardWith('auto', [])
  await saveBoard(w.$, b)
  w.put(`${WT}/.git`, 'gitdir: x')
  let done = false
  w.onRun(async cmd => {
    if (done || !/ git /.test(cmd)) return
    done = true
    await runTool(w.$, 'drop', { task: 'T-1' })
  })
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  await workerFinished(w.$, 'ag1', 'made the change')
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('dropped')
  expect(t.conflict_tries ?? 0).toBe(0)
  expect(t.merge_main ?? false).toBe(false)
})

test('retry after a clash with main gives the task its merge-main tries again, starting with a merge', async () => {
  const w = world()
  const [b] = boardWith('auto', [], { status: 'failed', note: 'conflicts with the latest main, still after 2 tries to merge it in', conflict_tries: 2, merge_main: false })
  await saveBoard(w.$, b)
  expect(onConflict(find(await load(w.$), 'T-1')!)).toBe('fail')
  const out = await runTool(w.$, 'retry', { task: 'T-1' })
  expect(out).toBe('T-1 queued; its new worker merges the latest main first')
  const t = find(await load(w.$), 'T-1')!
  expect(t.conflict_tries).toBe(0)
  expect(t.merge_main).toBe(true)
  expect(onConflict(t)).toBe('retry')
})

test('retry after a failure that was not a clash resets the merge-main tries but does not ask for a merge', async () => {
  const w = world()
  const [b] = boardWith('auto', [], { status: 'failed', note: 'tests failed', conflict_tries: 1, merge_main: false })
  await saveBoard(w.$, b)
  expect(await runTool(w.$, 'retry', { task: 'T-1' })).toBe('T-1 queued')
  const t = find(await load(w.$), 'T-1')!
  expect(t.conflict_tries).toBe(0)
  expect(t.merge_main ?? false).toBe(false)
})

// ---------------- old tasks: archive.json ----------------

const ARCHIVE = `${ROOT}/.symcc/archive.json`
const LONG_AGO = '2026-01-01T00:00:00.000Z'

/** A saved board: T-1 done long ago, T-2 dropped long ago, T-3 done just now, T-4 to do; this session drives. */
async function archiveWorld() {
  const w = world()
  let b: Board = emptyBoard()
  for (const title of ['old done', 'old dropped', 'new done', 'to do']) b = addTask(b, { origin: { why: 'a test' }, title }, ISO)[0]
  b = patchTask(b, 'T-1', { status: 'done', runs: [{ started: LONG_AGO, ended: '2026-01-01T00:10:00.000Z', tokens: { output: 500 } }] }, LONG_AGO)
  b = patchTask(b, 'T-2', { status: 'dropped' }, LONG_AGO)
  b = patchTask(b, 'T-3', { status: 'done' }, new Date(T0).toISOString())
  await saveBoard(w.$, b)
  S.driving = true
  S.lastArchive = 0
  S.archiveBroken = ''
  w.calls.splice(0)
  return { w, b }
}

test('archiving moves old done and dropped tasks to archive.json, written first, and keeps next_id and the totals', async () => {
  const { w, b } = await archiveWorld()
  expect(await archiveOld(w.$, T0)).toEqual(['T-1', 'T-2'])
  const moves = w.calls.filter(c => c.startsWith('mv '))
  expect(moves.length).toBe(2)
  expect(tmpMove(moves[0]!, ARCHIVE) && tmpMove(moves[1]!, BOARD)).toBe(true)
  const after = await load(w.$)
  expect(after.tasks.map(t => t.id)).toEqual(['T-3', 'T-4'])
  expect(after.next_id).toBe(b.next_id)
  expect(after.archived).toEqual({ done: 1, dropped: 1, tries: 1, ms: 600_000, tokens: { output: 500 } })
  expect(after.archived_done).toEqual(['T-1'])
  expect(JSON.parse(w.files.get(ARCHIVE)!).tasks.map((t: SymccTask) => t.id)).toEqual(['T-1', 'T-2'])
  expect(await runTool(w.$, 'board', {})).toMatch(/archived: 1 done, 1 dropped/)
  expect(await runTool(w.$, 'board', {})).toMatch(/total: 10m · 500 tokens in all over 1 try/)
  // at most once an hour
  expect(await archiveOld(w.$, T0 + 60_000)).toEqual([])
})

test('archiving runs only in the driving session, and never with archive_days 0', async () => {
  const { w } = await archiveWorld()
  S.driving = false
  expect(await archiveOld(w.$, T0)).toEqual([])
  S.driving = true
  await change(w.$, x => ({ ...x, archive_days: 0 }))
  expect(await archiveOld(w.$, T0)).toEqual([])
  expect((await load(w.$)).tasks.length).toBe(4)
  expect(w.files.has(ARCHIVE)).toBe(false)
})

test('when archive.json cannot be written, nothing leaves the board', async () => {
  const { w } = await archiveWorld()
  const fs = (w.$ as unknown as { fs: { write: (p: string, t: string) => Promise<unknown> } }).fs
  const write = fs.write
  fs.write = async (p, t) => {
    if (p.startsWith(ARCHIVE)) throw new Error('disk full')
    return write(p, t)
  }
  expect(await archiveOld(w.$, T0)).toEqual([])
  expect((await load(w.$)).tasks.length).toBe(4)
  expect((await load(w.$)).archived).toBeUndefined()
  expect(w.toasts.some(t => /not archived: disk full/.test(t))).toBe(true)
})

test('a broken archive.json is never written over: a copy is kept, the owner is told, nothing is archived', async () => {
  const { w } = await archiveWorld()
  w.put(ARCHIVE, '{"tasks": [')
  expect(await archiveOld(w.$, T0)).toEqual([])
  expect(w.files.get(ARCHIVE)).toBe('{"tasks": [')
  expect((await load(w.$)).tasks.length).toBe(4)
  const copies = [...w.files.keys()].filter(p => p.startsWith(`${ARCHIVE}.broken-`))
  expect(copies.length).toBe(1)
  expect(w.toasts.filter(t => /archive\.json can't be read/.test(t)).length).toBe(1)
  // told once, not every hour
  expect(await archiveOld(w.$, T0 + 2 * 3_600_000)).toEqual([])
  expect(w.toasts.filter(t => /archive\.json can't be read/.test(t)).length).toBe(1)
  // fixed: archiving goes on
  w.put(ARCHIVE, '{"version":1,"tasks":[]}')
  expect(await archiveOld(w.$, T0 + 4 * 3_600_000)).toEqual(['T-1', 'T-2'])
})

test('an archived task can still be looked up, is read-only, and an archived dropped task can be retried', async () => {
  const { w } = await archiveWorld()
  await archiveOld(w.$, T0)
  expect(await runTool(w.$, 'board', { task: 'T-1' })).toMatch(/^T-1 is archived[\s\S]*T-1 {2}\[done\] {2}old done/)
  await expect(runTool(w.$, 'change', { task: 'T-1', title: 'x' })).rejects.toThrow(/T-1 is archived/)
  await expect(runTool(w.$, 'ask', { task: 'T-2', question: 'x?' })).rejects.toThrow(/T-2 is archived/)
  await expect(runTool(w.$, 'retry', { task: 'T-1' })).rejects.toThrow(/T-1 is archived/)
  expect(await runTool(w.$, 'retry', { task: 'T-2' })).toBe('T-2 brought back from the archive and queued')
  const b = await load(w.$)
  expect(find(b, 'T-2')!.status).toBe('todo')
  expect(find(b, 'T-2')!.history.at(-1)).toBe('brought back from the archive (was dropped)')
  expect(b.archived).toEqual({ done: 1, dropped: 0, tries: 1, ms: 600_000, tokens: { output: 500 } })
  expect(JSON.parse(w.files.get(ARCHIVE)!).tasks.map((t: SymccTask) => t.id)).toEqual(['T-1'])
  await expect(runTool(w.$, 'board', { task: 'T-9' })).rejects.toThrow(/not on the board or in the archive/)
})

// ---------------- a worker asks the owner ----------------

/** T-1 is "doing" with worker ag1, which then answers `answer`; notify and driving as given. */
/**
 * T-1's worker (files src/; its folder holds edits in src/a.ts) hands back `answer`. `ask` / `requested`: what its
 * try recorded (an ask_owner call, edits refused as outside its files); `end`: why its turn ended.
 */
async function workerAnswers(answer: string, o: { notify?: 'off' | 'sound' | 'voice'; driving?: boolean; git?: Partial<Git>; ask?: WorkerQuestion; requested?: string[]; end?: TurnEnd } = {}) {
  const w = world(o.git)
  const [b0] = boardWith('auto', ['npm test'], { history: ['created by the lead'] })
  await saveBoard(w.$, recorded({ ...b0, notify: o.notify ?? 'voice' }, { question: o.ask, requested: o.requested }))
  w.put(`${WT}/.git`, 'gitdir: x')
  S.driving = o.driving ?? true
  sayQueue.splice(0)
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  await workerFinished(w.$, 'ag1', answer, o.end)
  S.driving = false
  return { w, t: find(await load(w.$), 'T-1')! }
}

test("a worker's ask_owner question makes the task wait for the owner with the question, not fail", async () => {
  saidNeedsYou.clear()
  const { w, t } = await workerAnswers('I asked the owner.', { ask: { question: 'Should the button be red or blue?' } })
  expect(t.status).toBe('waiting')
  expect(t.question).toBe('Should the button be red or blue?')
  expect(t.note).toBe('waiting for you')
  expect(t.history.at(-1)).toBe('try 1: worker asked: Should the button be red or blue?')
  // it needs the owner now: the update is urgent (OpenCode steers it into a busy lead, T-464)
  expect(S.leadUrgent).toBe(true)
  expect(leadQueue.join('\n')).toContain('T-1 is waiting for the owner: Should the button be red or blue? Answer it yourself only if the owner already clearly said the answer: then symcc change T-1 with answer: that answer, and tell the owner what you answered. Otherwise ask the owner in the chat now, plain and short, and say they can also answer on the board; put their answer into the task with symcc change T-1 and answer: their words. If they answer on the board first (a "Meanwhile" line), don\'t ask again.')
  expect(movedMain(w)).toBe(false)
  expect(w.calls).not.toContain(`root: git worktree remove --force ${WT}`)
})

test("a worker's question with options saves the options, and the lead is told to offer them", async () => {
  const { t } = await workerAnswers('', { notify: 'off', ask: { question: 'Which colour?', options: ['red', 'blue', 'green'] } })
  expect(t.status).toBe('waiting')
  expect(t.question).toBe('Which colour?')
  expect((t as { options?: string[] }).options).toEqual(['red', 'blue', 'green'])
  expect(leadQueue.join('\n')).toContain('Options: red | blue | green.')
  expect(leadQueue.join('\n')).toContain('Otherwise ask the owner in the chat now, plain and short, offering the options as numbered plain chat text, plus "or answer on the board"')
  // Claude Code's words name its pop-up question tool (T-371: another host may have none)
  S.W = CLAUDE_WORDS
  expect(workerQuestionText('T-1', 'Which colour?', ['red', 'blue', 'green'])).toContain('Otherwise ask the owner in the chat now, plain and short, offering the options as numbered plain chat text (not AskUserQuestion: its dialog stays open if they answer on the board), plus "or answer on the board"')
})

test('a change worker whose edits outside its files were refused waits for those files, and nothing is merged even with half-done edits', async () => {
  saidNeedsYou.clear()
  // world(): the task's folder holds edits in src/a.ts, inside the task's files (src/)
  const { w, t } = await workerAnswers('I changed src/a.ts; README.md was refused.', { requested: ['README.md', 'docs/a.md'] })
  expect(t.status).toBe('waiting')
  expect(t.question).toBe('T-1 needs to change files outside its list: README.md, docs/a.md. Allow them?')
  expect(t.note).toBe('waiting for you')
  expect(t.history.at(-1)).toBe('try 1: worker asked for more files: README.md, docs/a.md')
  expect((t as { asked_files?: string[] }).asked_files).toEqual(['README.md', 'docs/a.md'])
  expect(leadQueue.join('\n')).toContain('The task now waits for the owner, who can allow the files from the board')
  expect(S.leadUrgent).toBe(true)
  expect(sayQueue).toEqual(['?T-1'])
  expect(movedMain(w)).toBe(false)
  expect(w.calls.some(c => / git commit/.test(c))).toBe(false)
  expect(ranTests(w)).toEqual([])
})

test('a question wins over refused edits, and both win over how the turn ended', async () => {
  const both = await workerAnswers('', { notify: 'off', ask: { question: 'Which?' }, requested: ['README.md'], end: { reason: 'aborted' } })
  expect(both.t).toMatchObject({ status: 'waiting', question: 'Which?' })
  const files = await workerAnswers('', { notify: 'off', requested: ['README.md'], end: { reason: 'error' } })
  expect(files.t.status).toBe('waiting')
  expect((files.t as { asked_files?: string[] }).asked_files).toEqual(['README.md'])
})

test('a hand-back whose text says "QUESTION:" or "NEED FILES:", with no ask_owner call or refused edit, is checked and merged normally', async () => {
  for (const answer of ['QUESTION: Should the button be red or blue?', 'NEED FILES: README.md — the docs mention it', 'I looked around.\nQUESTION: Which colour?\nOPTIONS: red | blue']) {
    const { w, t } = await workerAnswers(answer, { notify: 'off' })
    expect(t.status).toBe('done')
    expect(t.question ?? undefined).toBeUndefined()
    expect((t as { asked_files?: string[] }).asked_files).toBeUndefined()
    expect(movedMain(w)).toBe(true)
  }
})

test("a turn that ended on an API error or a refusal fails the task with the reason, and nothing is merged", async () => {
  const err = await workerAnswers('half done', { notify: 'off', end: { reason: 'error' } })
  expect(err.t.status).toBe('failed')
  expect(err.t.note).toBe("the worker's turn ended on an error (retries used up or the context limit)")
  expect(err.t.history.at(-1)).toBe("try 1: the worker's turn ended on an error (retries used up or the context limit); nothing was checked or merged")
  expect(movedMain(err.w)).toBe(false)
  expect(ranTests(err.w)).toEqual([])
  expect(leadQueue.join('\n')).toContain('so nothing was checked or merged and the task failed')
  const refused = await workerAnswers('', { notify: 'off', end: { reason: 'refusal', refusal: { category: 'cyber', explanation: 'not allowed here' } } })
  expect(refused.t.status).toBe('failed')
  expect(refused.t.note).toBe('the model refused to go on (cyber: not allowed here)')
  expect(movedMain(refused.w)).toBe(false)
  const bare = await workerAnswers('', { notify: 'off', end: { reason: 'refusal', refusal: { category: null, explanation: null } } })
  expect(bare.t.note).toBe('the model refused to go on')
})

test('a stopped turn (aborted) still fails the task as stopped, and nothing is merged', async () => {
  const { w, t } = await workerAnswers('', { notify: 'off', end: { reason: 'aborted' } })
  expect(t.status).toBe('failed')
  expect(t.note).toBe('the worker was stopped')
  expect(movedMain(w)).toBe(false)
})

test("ask_owner from a scout is refused; from a running worker it is written to its try on the board (the last call wins)", async () => {
  const w = world()
  const [b] = boardWith('auto', ['npm test'])
  await saveBoard(w.$, b)
  scoutRuns.set('s1', 'gaps')
  expect(await askCall(w.$, 's1', { question: 'Which?' })).toMatch(/^Refused: .*not scouts/)
  scoutRuns.delete('s1')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  expect(await askCall(w.$, 'ag1', { question: 'First?' })).toBe('Sent to the owner. Stop now and hand back.')
  expect(await askCall(w.$, 'ag1', { question: 'Which?', options: ['a', 'b'] })).toBe('Sent to the owner. Stop now and hand back.')
  expect((find(await load(w.$), 'T-1') as BoardTask).try_question).toEqual({ question: 'Which?', options: ['a', 'b'] })
  workers.delete('ag1')
})

test("a question and a refused edit survive a plugin reload before the hand-back: the task then waits with them", async () => {
  // the question: recorded, then the plugin reloads (its memory starts over), then the late hand-back arrives
  S.me = 'me'
  const q = world()
  const [b] = boardWith('auto', ['npm test'], { agent: 'ag1', session: 'me', runs: [{ started: ISO }] } as Partial<BoardTask>)
  await saveBoard(q.$, b)
  q.put(`${WT}/.git`, 'gitdir: x')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  expect(await askCall(q.$, 'ag1', { question: 'Red or blue?', options: ['red', 'blue'] })).toBe('Sent to the owner. Stop now and hand back.')
  workers.clear()
  expect(await lateHandBack(q.$, 'ag1')).toBe(true)
  await workerFinished(q.$, 'ag1', 'I asked the owner.')
  const asked = find(await load(q.$), 'T-1') as BoardTask
  expect(asked).toMatchObject({ status: 'waiting', question: 'Red or blue?', options: ['red', 'blue'] })
  expect(asked.try_question).toBeUndefined()
  expect(movedMain(q)).toBe(false)
  // a refused edit: the same, through the tool.check hook's part
  const f = world()
  await saveBoard(f.$, b)
  f.put(`${WT}/.git`, 'gitdir: x')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  expect(await checkEdit(f.$, 'ag1', { path: `${WT}/README.md` })).toMatch(/README\.md is outside this task's files/)
  expect((find(await load(f.$), 'T-1') as BoardTask).try_refused).toEqual(['README.md'])
  workers.clear()
  expect(await lateHandBack(f.$, 'ag1')).toBe(true)
  await workerFinished(f.$, 'ag1', 'README.md was refused.')
  const files = find(await load(f.$), 'T-1') as BoardTask
  expect(files).toMatchObject({ status: 'waiting', asked_files: ['README.md'] })
  expect(files.try_refused).toBeUndefined()
  expect(movedMain(f)).toBe(false)
  workers.clear()
})

test('what a try recorded for its hand-back is cleared when a new try starts, and when the task leaves "doing"', () => {
  const [b] = boardWith('auto')
  const rec = recorded(b, { question: { question: 'Which?' }, requested: ['README.md'] })
  expect(find(rec, 'T-1')).toMatchObject({ try_question: { question: 'Which?' }, try_refused: ['README.md'] })
  for (const next of [patchTask(rec, 'T-1', { attempts: 2 }, ISO), patchTask(rec, 'T-1', { status: 'todo' }, ISO)]) {
    expect(find(next, 'T-1')).not.toHaveProperty('try_question')
    expect(find(next, 'T-1')).not.toHaveProperty('try_refused')
  }
  // a change on the same try keeps them
  expect(find(patchTask(rec, 'T-1', { note: 'x' }, ISO), 'T-1')).toMatchObject({ try_refused: ['README.md'] })
})

test('the worker prompts say how to ask and what a refused edit means, with no QUESTION / OPTIONS / NEED FILES wording', () => {
  const [c] = boardWith('auto', ['npm test'])
  const [i] = boardWith('auto', ['npm test'], { kind: 'investigation' } as Partial<BoardTask>)
  for (const p of [WORKER_PROMPT(c.tasks[0]!, c, WT), WORKER_PROMPT(i.tasks[0]!, i, WT)]) {
    expect(p).toContain('To ask the owner something, call the ask_owner tool. If an edit is refused as outside your files, stop and hand back.')
    expect(p).not.toMatch(/QUESTION|OPTIONS|NEED FILES/)
  }
})

/** A board where T-1 (files src/) waits after its worker's edits of `files` were refused. */
async function askedForFiles(files: string[]) {
  const w = world()
  const [b] = boardWith('auto')
  await saveBoard(w.$, patchTask(b, 'T-1', { status: 'waiting', question: `T-1 needs to change files outside its list: ${files.join(', ')}. Allow them?`, asked_files: files, note: 'waiting for you' } as Partial<BoardTask>, ISO))
  let saves = 0
  const fs = (w.$ as { fs: { write: (p: string, t: string) => Promise<void> } }).fs
  const write = fs.write
  fs.write = async (p, text) => ((saves += p.startsWith(`${BOARD}.`) && p.endsWith('.tmp') ? 1 : 0), write(p, text))
  return { w, saves: () => saves }
}

test('Allow on a file request widens the files and sends the task back to work in one change; the lead gets a Meanwhile line', async () => {
  const { w, saves } = await askedForFiles(['README.md', 'docs/a.md'])
  await allowAskedFiles(w.$, 'T-1')
  const t = find(await load(w.$), 'T-1')!
  expect(saves()).toBe(1)
  expect(t.status).toBe('todo')
  expect(t.files).toEqual(['src/', 'README.md', 'docs/a.md'])
  expect(t.history.at(-1)).toBe('the owner allowed files: + README.md, + docs/a.md')
  expect(t.question).toBeNull()
  expect(t).not.toHaveProperty('asked_files')
  expect(leadQueue).toEqual([])
  expect(meanwhile.join('\n')).toContain('The owner allowed README.md, docs/a.md for T-1')
})

test("Don't allow keeps the task waiting with a note and tells the lead at once", async () => {
  const { w } = await askedForFiles(['README.md'])
  await refuseAskedFiles(w.$, 'T-1')
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('waiting')
  expect(t.note).toBe('files not allowed')
  expect(t.files).toEqual(['src/'])
  expect(leadQueue.join('\n')).toContain("The owner didn't allow README.md for T-1: drop it or narrow the plan")
})

test('Allow or Don\'t allow on a task that does not wait for files is refused', async () => {
  const w = world()
  const [b] = boardWith('auto')
  await saveBoard(w.$, patchTask(b, 'T-1', { status: 'waiting', question: 'Which colour?' }, ISO))
  await expect(allowAskedFiles(w.$, 'T-1')).rejects.toThrow('not waiting for files')
  await expect(refuseAskedFiles(w.$, 'T-1')).rejects.toThrow('not waiting for files')
})

test('"T-1 needs you" is queued once per waiting question with notify on, and not with notify off or in another session', async () => {
  saidNeedsYou.clear()
  await workerAnswers('', { ask: { question: 'which colour?' } })
  expect(sayQueue).toEqual(['?T-1'])
  expect(spokenLine(sayQueue)).toBe('T-1 needs you')
  // the same question again (same try): not said twice
  await workerAnswers('', { ask: { question: 'which colour?' } })
  expect(sayQueue).toEqual([])
  saidNeedsYou.clear()
  await workerAnswers('', { notify: 'off', ask: { question: 'which colour?' } })
  expect(sayQueue).toEqual([])
  await workerAnswers('', { driving: false, ask: { question: 'which colour?' } })
  expect(sayQueue).toEqual([])
})

test('the spoken line joins merged tasks and tasks that need the owner', () => {
  expect(spokenLine(['T-3'])).toBe('T-3 done')
  expect(spokenLine(['?T-5'])).toBe('T-5 needs you')
  expect(spokenLine(['T-3', '?T-5', '?T-6'])).toBe('T-3 done. T-5 and T-6 need you')
  expect(spokenLine([])).toBe('')
})

// ---------------- history lines of a change ----------------

test('change on a running task adds a restart line naming the fields that changed, and a line for widened files', async () => {
  const w = world()
  const [b] = boardWith('review')
  await saveBoard(w.$, b)
  await runTool(w.$, 'change', { task: 'T-1', details: 'new plan', files: ['src/', 'docs/a.md', 'tests/'] })
  const t = find(await load(w.$), 'T-1')!
  expect(t.history).toContain('try 1: restarted: the task was changed (details, files)')
  expect(t.history).toContain('files widened: + docs/a.md, + tests/')
})

test("the owner's answer to a waiting task goes into its details and its history", async () => {
  const w = world()
  const [b] = boardWith('review')
  await saveBoard(w.$, patchTask(b, 'T-1', { status: 'waiting', question: 'Which docs?', note: 'waiting for you' }, ISO))
  await runTool(w.$, 'change', { task: 'T-1', answer: 'ok' })
  const t = find(await load(w.$), 'T-1')!
  expect(t.history.at(-1)).toBe('the owner answered: “ok”')
  expect(t.details).toContain('Owner\'s answer to "Which docs?": ok')
  expect(t.history.some(l => l.includes('restarted'))).toBe(false)
})

test('an answer to a task that is doing again (answered on the board first) changes nothing and keeps its worker', async () => {
  const w = world()
  const [b] = boardWith('review', [], { history: ['the owner answered: “blue”'] })
  await saveBoard(w.$, b)
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  const said = await runTool(w.$, 'change', { task: 'T-1', answer: 'red', order: 3 })
  const t = find(await load(w.$), 'T-1')!
  expect(said).toBe('T-1 was already answered (it is doing now, the owner answered: “blue”); nothing changed. To add something, use add_details. The other changes (order) were not made either; send them again without answer.')
  expect(t.status).toBe('doing')
  expect(t.details).toBe(find(b, 'T-1')!.details)
  expect(t.order).toBe(find(b, 'T-1')!.order)
  expect(t.history).toEqual(find(b, 'T-1')!.history)
  expect(workers.has('ag1')).toBe(true)
  workers.delete('ag1')
})

test('an answer to a task in review or to do changes nothing', async () => {
  for (const status of ['review', 'todo'] as const) {
    const w = world()
    const [b] = boardWith('review', [], { status })
    await saveBoard(w.$, b)
    const said = await runTool(w.$, 'change', { task: 'T-1', answer: 'red' })
    const t = find(await load(w.$), 'T-1')!
    expect(said).toBe(`T-1 was already answered (it is ${status === 'review' ? 'ready for review' : 'to do'} now); nothing changed. To add something, use add_details.`)
    expect(t.status).toBe(status)
    expect(t.details).toBe(find(b, 'T-1')!.details)
    expect(t.history).toEqual(find(b, 'T-1')!.history)
  }
})

test('change add_details adds a note to the details, keeps the old text and writes a history line', async () => {
  const w = world()
  const [b] = boardWith('review')
  await saveBoard(w.$, b)
  const before = find(b, 'T-1')!
  const said = await runTool(w.$, 'change', { task: 'T-1', add_details: 'also update the README' })
  const t = find(await load(w.$), 'T-1')!
  expect(t.details.startsWith(before.details.trimEnd())).toBe(true)
  expect(t.details).toMatch(/\n\nNote \(lead, \d{4}-\d\d-\d\d\): also update the README$/)
  expect(t.history).toContain('the lead added a note: “also update the README”')
  if (before.status === 'doing') expect(String(said)).toMatch(/restarting/)
})

test('change with both details and add_details is refused and changes nothing', async () => {
  const w = world()
  const [b] = boardWith('review')
  await saveBoard(w.$, b)
  await expect(runTool(w.$, 'change', { task: 'T-1', details: 'new', add_details: 'note' })).rejects.toThrow(/either details .* or add_details/)
  expect(find(await load(w.$), 'T-1')!.details).toBe(find(b, 'T-1')!.details)
})

test('pause of a running task and resume both leave a history line', async () => {
  const w = world()
  const [b] = boardWith('review')
  await saveBoard(w.$, b)
  await runTool(w.$, 'pause', { task: 'T-1' })
  await runTool(w.$, 'resume', { task: 'T-1' })
  const t = find(await load(w.$), 'T-1')!
  expect(t.history.slice(-2)).toEqual(['try 1: stopped: paused', 'resumed after a pause'])
})

test('change on a paused task keeps it paused with the change saved, and resume still starts it', async () => {
  const w = world()
  const [b0] = boardWith('review', [], { status: 'paused', note: 'paused' })
  const [b] = addTask(b0, { origin: { why: 'a test' }, title: 'Before it' }, ISO)
  await saveBoard(w.$, b)
  const changes: Record<string, unknown>[] = [
    { title: 'New title' }, { details: 'new plan' }, { add_details: 'also the README' },
    { files: ['src/', 'tests/'] }, { after: ['T-2'] }, { order: 7 },
  ]
  for (const c of changes) {
    const said = await runTool(w.$, 'change', { task: 'T-1', ...c })
    expect(String(said)).toMatch(/still paused/)
    expect(find(await load(w.$), 'T-1')!.status).toBe('paused')
  }
  const t = find(await load(w.$), 'T-1')!
  expect(t.title).toBe('New title')
  expect(t.details).toMatch(/^new plan\n\nNote \(lead, \d{4}-\d\d-\d\d\): also the README$/)
  expect(t.files).toEqual(['src/', 'tests/'])
  expect(t.after).toEqual(['T-2'])
  expect(t.order).toBe(7)
  expect(t.note).toBe('paused')
  await runTool(w.$, 'resume', { task: 'T-1' })
  expect(find(await load(w.$), 'T-1')!.status).toBe('todo')
})

// ---------------- each try's full report ----------------

const REPORT1 = `${ROOT}/.symcc/reports/T-1-try-1.md`

/** T-1 is "doing" (try 1, one run) with worker ag1, which then answers `answer`; the fake git and the task as given. */
async function finishes(answer: string, g: Partial<Git> = {}, extra: Partial<BoardTask> = {}, rec: Rec = {}) {
  const w = world(g)
  const [b0] = boardWith('auto', ['npm test'], { history: ['created by the lead'], runs: [{ started: ISO }], ...extra })
  await saveBoard(w.$, recorded(b0, rec))
  w.put(`${WT}/.git`, 'gitdir: x')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  await workerFinished(w.$, 'ag1', answer)
  return { w, t: find(await load(w.$), 'T-1')! }
}

test("a try's full report is saved to .symcc/reports through a temp file, with its path on the run", async () => {
  const long = `I changed src/a.ts.\n\n${'Every word here counts. '.repeat(400)}\nThe end.`
  const { w, t } = await finishes(long)
  expect(t.status).toBe('done')
  expect(t.runs![0]!.report).toBe('.symcc/reports/T-1-try-1.md')
  // kept in full, not cut to the old 600 characters
  expect(w.files.get(REPORT1)).toBe(`${long.trim()}\n`)
  expect([...w.files.keys()].filter(p => p.startsWith(`${REPORT1}.`) && p.endsWith('.tmp'))).toEqual([])
  expect(w.calls.some(c => tmpMove(c, REPORT1))).toBe(true)
  // the history line stays short and ends cleanly, never inside a word
  const line = t.history.find(l => l.startsWith('try 1: '))!
  const said = line.slice('try 1: '.length, line.indexOf(' → '))
  expect(said.length).toBeLessThanOrEqual(300)
  expect(said.endsWith('…')).toBe(true)
  expect(said).toMatch(/(counts\.|here|word|Every) ?…$/)
})

test('a report longer than the cap is kept up to the cap, with a line saying it was cut', async () => {
  const { w } = await finishes(`START ${'y'.repeat(REPORT_MAX_CHARS + 5000)}`)
  const text = w.files.get(REPORT1)!
  expect(text.startsWith(`START ${'y'.repeat(100)}`)).toBe(true)
  expect(text.length).toBeLessThan(REPORT_MAX_CHARS + 200)
  expect(text).toContain('(cut here: the report was longer than 50 KB)')
})

test("a try that asked the owner saves its text as the try's report too", async () => {
  const { w, t } = await finishes('I looked around; README.md was refused.', {}, {}, { requested: ['README.md'] })
  expect(t.status).toBe('waiting')
  expect(t.runs![0]!.report).toBe('.symcc/reports/T-1-try-1.md')
  expect(w.files.get(REPORT1)).toContain('README.md was refused')
})

test('a report that cannot be saved is told once and never blocks the task', async () => {
  // a failing move: the task still goes on; told to the lead only once
  for (const n of [1, 2]) {
    const w = world()
    const [b0] = boardWith('auto', [], { runs: [{ started: ISO }] })
    await saveBoard(w.$, b0)
    const run = w.$
    const real = run.run
    run.run = async (a, o) => (a[0] === 'mv' && String(a[2]).includes('/reports/') ? { exitCode: 1, stdout: '', stderr: 'disk full' } : real(a, o))
    leadQueue.splice(0)
    workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
    await workerFinished(w.$, 'ag1', 'Done.')
    const t = find(await load(w.$), 'T-1')!
    expect(t.status).toBe('done')
    expect(t.runs![0]!.report).toBeUndefined()
    expect(leadQueue.some(m => /could not save the worker's report/.test(m))).toBe(n === 1)
  }
})

test('merged work that adds a file under docs/research/ keeps it as a research note on the task', async () => {
  const { t } = await finishes('Wrote the note.', { changed: ['docs/research/market.md', 'docs/guide.md'] }, { files: ['docs/'] })
  expect(t.status).toBe('done')
  expect(t.research_notes).toEqual(['docs/research/market.md'])
  const { t: plain } = await finishes('Done.')
  expect(plain.research_notes).toBeUndefined()
})

// ---------------- what reaches the lead ----------------

/** A fake Host whose timer runs at once and whose messages to the lead are kept in `sent`. */
function leadWorld() {
  const sent: string[] = []
  const { host } = fakeHost({ clock: { after: (_ms, f) => (f(), { cancel() {} }) }, lead: { send: async text => void sent.push(text) } })
  S.leadTimer = null
  S.enabledNow = true
  leadQueue.splice(0)
  meanwhile.splice(0)
  return { $: host, sent }
}

test("the owner's own actions are queued, not sent; the next real board update starts with them", () => {
  const { $, sent } = leadWorld()
  noteForLead('The owner approved T-127: merged.')
  noteForLead('The owner changed the settings: notify set to off')
  expect(sent).toEqual([])
  expect(S.leadTimer).toBe(null)
  tellLead($, 'T-3 "x" is ready for review.')
  expect(sent.length).toBe(1)
  const text = sent[0]!
  expect(text).toContain('Meanwhile the owner (nothing to answer):\n- The owner approved T-127: merged.\n- The owner changed the settings: notify set to off\n\nT-3 "x" is ready for review.')
  expect(text.indexOf('Meanwhile')).toBeLessThan(text.indexOf('T-3'))
  expect(meanwhile.length).toBe(0)
  // the next update has no Meanwhile block
  S.leadTimer = null
  tellLead($, 'T-4 failed.')
  expect(sent[1]).not.toContain('Meanwhile')
})

test('the Meanwhile block shows at most 10 lines, then "+N more"', () => {
  expect(meanwhileText([])).toBe('')
  const text = meanwhileText(Array.from({ length: 13 }, (_, i) => `line ${i + 1}`))
  expect(text).toContain('- line 10')
  expect(text).not.toContain('line 11')
  expect(text.endsWith('- +3 more')).toBe(true)
})

test('owner settings changes are queued for the lead, not sent', async () => {
  const w = world()
  await saveBoard(w.$, emptyBoard())
  const out = await ownerSettings(w.$, { max_parallel: 5 }, 'from the board')
  expect(out).toContain('max_parallel')
  expect(leadQueue).toEqual([])
  expect(meanwhile.length).toBe(1)
  expect(meanwhile[0]).toContain('The owner changed the settings: ')
})

test('a merge the owner approved sends no board update; it joins the Meanwhile lines', async () => {
  const w = await inReview()
  await runTool(w.$, 'approve', { task: 'T-1' })
  expect(find(await load(w.$), 'T-1')!.status).toBe('done')
  expect(leadQueue).toEqual([])
  expect(meanwhile).toEqual([`✓ T-1 "Do it" merged into main (${H1.slice(0, 8)}); approved by the owner.`])
})

test("a worker's result still reaches the lead, as the outcome only (its report came as the hand-back)", async () => {
  const { t } = await finishes('I changed src/a.ts and added a very particular sentence.')
  expect(t.status).toBe('done')
  const msg = leadQueue.join('\n')
  expect(msg).toMatch(/^✓ T-1 "Do it" merged into main \([0-9a-f]{8}\)/)
  expect(msg).not.toContain('very particular sentence')
  expect(meanwhile).toEqual([])
})

// ---------------- notify: off, sound or voice ----------------

/**
 * A fake machine for notify: `uname` answers `os` ('' = no uname, as on Windows, where `cmd /c ver`
 * answers instead), and only the programs in `programs` and the files in `files` are found.
 * Every command run is kept in `ran` (with its env), so a test can see nothing was played while looking.
 */
function machine(os: string, programs: string[], files: string[] = []) {
  const w = world()
  const ran: { argv: string[]; env?: Record<string, string> }[] = []
  const $ = w.$
  const real = $.run
  $.run = async (argv, o = {}) => {
    if (['git', 'mv', 'ln', 'rm'].includes(argv[0]!)) return real(argv, o)
    ran.push({ argv: [...argv], ...(o.env ? { env: o.env } : {}) })
    const [cmd, ...rest] = argv
    if (cmd === 'uname') return os ? ok(os + '\n') : fail('not found', 127)
    if (cmd === 'cmd') return !os ? ok('\r\nMicrosoft Windows [Version 10.0.22631]\r\n') : fail('not found', 127)
    if (cmd === 'sh' && rest[0] === '-c' && rest[1]!.startsWith('command -v')) return programs.includes(rest[3]!) ? ok() : fail()
    if (cmd === 'where') return programs.includes(rest[0]!) ? ok(`C:\\Windows\\${rest[0]}.exe`) : fail()
    if (cmd === 'test') return files.includes(rest[1]!) ? ok() : fail()
    return ok()
  }
  S.players = null
  S.toldUnplayable = false
  S.notifyWanted = null
  sayQueue.splice(0)
  return { ...w, ran }
}
const MAC_FILES = ['/System/Library/Sounds/Glass.aiff', '/System/Library/Sounds/Ping.aiff']
const FD = '/usr/share/sounds/freedesktop/stereo'
/** The programs looked up or run, in order (lookups as "?name"). */
const lookedUp = (ran: { argv: string[] }[]) => ran.map(r => (r.argv[0] === 'sh' ? `?${r.argv[4]}` : r.argv[0] === 'where' ? `?${r.argv[1]}` : r.argv[0] === 'test' ? `?${r.argv[2]}` : r.argv.join(' ')))

test('notify finds what the machine can play by looking for programs, once per session, playing nothing', async () => {
  const mac = machine('Darwin', ['say', 'afplay'], MAC_FILES)
  expect(await playable(mac.$)).toEqual({ system: 'mac', sound: true, voice: true })
  // only lookups: no say, afplay or other player was run
  expect(lookedUp(mac.ran).filter(x => !x.startsWith('?'))).toEqual(['uname -s'])
  const n = mac.ran.length
  await playable(mac.$)
  expect(mac.ran.length).toBe(n)

  const linux = machine('Linux', ['paplay'], [`${FD}/complete.oga`])
  expect(await playable(linux.$)).toEqual({ system: 'linux', sound: true, voice: false })
  const linuxVoice = machine('Linux', ['espeak'])
  expect(await playable(linuxVoice.$)).toEqual({ system: 'linux', sound: false, voice: true })
  // paplay without a sound file can't chime; canberra needs no file
  expect((await playable(machine('Linux', ['paplay']).$)).sound).toBe(false)
  expect((await playable(machine('Linux', ['canberra-gtk-play']).$)).sound).toBe(true)

  // Windows: no uname; cmd /c ver says Windows, and PowerShell is looked up with where
  const win = machine('', ['powershell'])
  expect(await playable(win.$)).toEqual({ system: 'windows', sound: true, voice: true })
  expect(lookedUp(win.ran)).toEqual(['uname -s', 'cmd /c ver', '?powershell'])
  // Git Bash on Windows answers uname with MINGW
  expect((await playable(machine('MINGW64_NT-10.0', ['powershell']).$)).system).toBe('windows')
  expect(await playable(machine('', []).$)).toEqual({ system: 'windows', sound: false, voice: false })
  expect(await playable(machine('FreeBSD', ['espeak']).$)).toEqual({ system: 'other', sound: false, voice: false })
})

test('sound plays a chime (a different one when a question waits), voice says the line; the text is an argument, never shell code', async () => {
  const evil = "T-3'; rm -rf ~; echo '"
  const mac = machine('Darwin', ['say', 'afplay'], MAC_FILES)
  expect(await playsFor(mac.$, 'voice', ['T-3'])).toEqual([{ argv: ['say', '-r', '200', 'repo: T-3 done'] }])
  expect(await playsFor(mac.$, 'sound', ['T-3'])).toEqual([{ argv: ['afplay', '/System/Library/Sounds/Glass.aiff'] }])
  expect(await playsFor(mac.$, 'sound', ['T-3', '?T-5'])).toEqual([{ argv: ['afplay', '/System/Library/Sounds/Ping.aiff'] }])
  expect(await playsFor(mac.$, 'off', ['T-3'])).toEqual([])
  expect(await playsFor(mac.$, 'voice', [evil])).toEqual([{ argv: ['say', '-r', '200', `repo: ${evil} done`] }])

  const linux = machine('Linux', ['spd-say', 'espeak', 'paplay', 'canberra-gtk-play'], [`${FD}/complete.oga`, `${FD}/bell.oga`])
  expect((await playsFor(linux.$, 'voice', ['T-3'])).map(p => p.argv)).toEqual([['spd-say', '-w', 'repo: T-3 done'], ['espeak', 'repo: T-3 done']])
  expect((await playsFor(linux.$, 'sound', ['?T-5'])).map(p => p.argv)).toEqual([['paplay', `${FD}/bell.oga`], ['canberra-gtk-play', '-i', 'bell']])
  // none saved: the best this machine has (voice)
  expect((await playsFor(linux.$, null, ['T-3']))[0]!.argv[0]).toBe('spd-say')

  // Windows: the text goes in an environment value the script reads, never into the script
  const win = machine('', ['powershell'])
  const [speak] = await playsFor(win.$, 'voice', [evil])
  expect(speak!.argv.slice(0, 4)).toEqual(['powershell', '-NoProfile', '-NonInteractive', '-Command'])
  expect(speak!.argv[4]).toBe(`Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak($env:${WIN_TEXT_VAR})`)
  expect(speak!.argv.join(' ')).not.toContain('rm -rf')
  expect(speak!.env).toEqual({ [WIN_TEXT_VAR]: `repo: ${evil} done` })
  const [chime] = await playsFor(win.$, 'sound', ['T-3'])
  expect(chime!.argv[4]).toContain('[System.Media.SystemSounds]::Asterisk.Play()')
  expect((await playsFor(win.$, 'sound', ['?T-3']))[0]!.argv[4]).toContain('Exclamation')
})

test('only the driving session plays, lines are joined, and the first command that works is the last one tried', async () => {
  const m = machine('Linux', ['spd-say', 'espeak'])
  const b = { ...emptyBoard(), notify: 'voice' as const }
  S.driving = false
  sayDone(m.$, b, 'T-3')
  expect(sayQueue).toEqual([])
  S.driving = true
  sayDone(m.$, { ...b, notify: 'off' }, 'T-3')
  expect(sayQueue).toEqual([])
  sayDone(m.$, b, 'T-3')
  sayDone(m.$, b, 'T-4')
  S.sayTimer = null
  await sayNext(m.$)
  S.driving = false
  const played = m.ran.filter(r => ['spd-say', 'espeak'].includes(r.argv[0]!))
  expect(played.map(r => r.argv)).toEqual([['spd-say', '-w', 'repo: T-3 and T-4 done']])
})

test("a saved notify this machine can't play is told once, plays nothing, and the setting is kept", async () => {
  const m = machine('Linux', ['paplay'], [`${FD}/complete.oga`])
  await saveBoard(m.$, { ...emptyBoard(), notify: 'voice' })
  expect(await playsFor(m.$, 'voice', ['T-3'])).toEqual([])
  expect(await playsFor(m.$, 'voice', ['T-4'])).toEqual([])
  const notes = m.toasts.filter(t => t.includes('nothing will play'))
  expect(notes).toEqual([JSON.stringify("symcc: notify is 'voice' but no speech program was found here; nothing will play")])
  expect((await load(m.$)).notify).toBe('voice')
})

test("notify can't be set to a choice this machine can't play: the owner and the lead are told why", async () => {
  const m = machine('Linux', ['paplay'], [`${FD}/complete.oga`])
  await saveBoard(m.$, { ...emptyBoard(), notify: 'off' })
  const why = "voice isn't available here: no speech program found (install espeak or speech-dispatcher)"
  expect(await ownerSettings(m.$, { notify: 'voice' }, 'with /symcc-settings')).toBe(why)
  expect(await runTool(m.$, 'settings', { notify: 'voice' })).toBe(why)
  expect((await load(m.$)).notify).toBe('off')
  expect(await ownerSettings(m.$, { notify: 'loud' }, 'from the board')).toContain('notify must be "off", "sound" or "voice"')
  expect(await ownerSettings(m.$, { notify: 'sound' }, 'from the board')).toBe('notify set to sound')
  expect((await load(m.$)).notify).toBe('sound')
})

// ---------------- how each try ended ----------------

/** T-1 is "doing" (try 1, one open run) with worker ag1; `then` ends it. Gives back the run as saved. */
async function tryEnds(then: (w: ReturnType<typeof world>) => Promise<unknown>, o: { g?: Partial<Git>; tests?: Record<string, Res>; extra?: Partial<BoardTask> } = {}) {
  const w = world(o.g, o.tests)
  const [b0] = boardWith('auto', ['npm test'], { history: ['created by the lead'], runs: [{ started: ISO }], ...o.extra })
  await saveBoard(w.$, b0)
  w.put(`${WT}/.git`, 'gitdir: x')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  await then(w)
  workers.delete('ag1')
  const t = find(await load(w.$), 'T-1')!
  const r = t.runs!.at(-1)!
  return { t, r, end: [r.ended_by, r.ended_note] }
}
const answers = (answer: string, end?: TurnEnd, rec: Rec = {}) => async (w: ReturnType<typeof world>) => (await change(w.$, b => recorded(b, rec)), workerFinished(w.$, 'ag1', answer, end))

test('a finished try ends with the outcome of its check', async () => {
  const merged = await tryEnds(answers('made the change'))
  expect(merged.end).toEqual(['finished', 'merged'])
  expect(merged.r.ended).toBeDefined()
  expect((await tryEnds(answers('made the change'), { extra: { needs_review: true } })).end).toEqual(['finished', 'ready for review'])
  expect((await tryEnds(answers('made the change'), { tests: { 'npm test': { exitCode: 1, stdout: 'FAIL', stderr: '' } } })).end).toEqual(['finished', 'tests failed'])
  expect((await tryEnds(answers('made the change'), { g: { upToDate: false, conflict: true } })).end).toEqual(['finished', 'clash with main'])
  expect((await tryEnds(answers('made the change'), { g: { changed: ['README.md'] } })).end).toEqual(['finished', 'out of scope'])
})

test('a try that asks ends as asked (a question, or files outside its list); one stopped from Claude Code as stopped; an error as stopped with the reason', async () => {
  expect((await tryEnds(answers('', undefined, { question: { question: 'red or blue?' } }))).end).toEqual(['asked', 'question'])
  expect((await tryEnds(answers('', undefined, { requested: ['README.md'] }))).end).toEqual(['asked', 'files outside its list'])
  expect((await tryEnds(answers('', { reason: 'aborted' }))).end).toEqual(['stopped', 'stopped from the app'])
  // Claude Code's words name it (T-475)
  S.W = CLAUDE_WORDS
  expect((await tryEnds(answers('', { reason: 'aborted' }))).end).toEqual(['stopped', 'stopped from Claude Code'])
  S.W = SYMCC_WORDS
  expect((await tryEnds(answers('', { reason: 'error' }))).end).toEqual(['stopped', "the worker's turn ended on an error (retries used up or the context limit)"])
})

test('T-411: only the host seeing a background command still running fails a try; an answer that only says it will continue later just adds a warning', async () => {
  // the host's signal: a background command still running when the turn ended fails the try, whatever the answer says
  const ran = await tryEnds(answers('Changed src/a.ts; tests/a.test.ts covers it.', { reason: 'answer', background: ['bun test'] }))
  expect([ran.t.status, ran.t.note]).toEqual(['failed', 'the worker ended its turn before its work finished'])
  expect(ran.end).toEqual(['stopped', 'the worker ended its turn before its work finished'])
  expect(ran.t.history.at(-1)).toContain('→ the worker ended its turn before its work finished; nothing was checked or merged')
  expect(leadQueue.some(x => x.includes('T-1') && x.includes('ended its turn before its work finished'))).toBe(true)
  // T-399's try 1: the text alone only warns (history and the lead's update); the try still goes to the tests and merge
  leadQueue.length = 0
  const early = await tryEnds(answers("Started the full test run in the background.\n\nThe background runs are still going; I'll continue when they finish."))
  expect(early.end).toEqual(['finished', 'merged'])
  const warning = `T-1's answer may have ended before its work finished: "The background runs are still going; I'll continue when they finish."`
  expect(early.t.history.some(h => h.includes(`warning: ${warning}`))).toBe(true)
  expect(leadQueue.some(x => x.includes(warning))).toBe(true)
  // the same with the host saying nothing ran: still only a warning
  expect((await tryEnds(answers("The background runs are still going; I'll continue when they finish.", { reason: 'answer', background: [] }))).end).toEqual(['finished', 'merged'])
  // a normal report: no warning
  leadQueue.length = 0
  const normal = await tryEnds(answers('Changed src/a.ts; tests/a.test.ts covers it.'))
  expect(normal.end).toEqual(['finished', 'merged'])
  expect(normal.t.history.some(h => h.includes('warning:'))).toBe(false)
  expect(leadQueue.some(x => x.includes('may have ended before'))).toBe(false)
})

test('a try stopped by the lead says why: changed (which fields), paused, dropped, asked, backlog', async () => {
  const changed = await tryEnds(w => runTool(w.$, 'change', { task: 'T-1', details: 'new plan', after: [] }))
  expect(changed.end).toEqual(['restarted', 'the task was changed (details)'])
  expect(changed.r.ended).toBeDefined()
  expect((await tryEnds(w => runTool(w.$, 'pause', { task: 'T-1', reason: 'later' }))).end).toEqual(['stopped', 'paused: later'])
  expect((await tryEnds(w => runTool(w.$, 'drop', { task: 'T-1' }))).end).toEqual(['stopped', 'dropped'])
  expect((await tryEnds(w => runTool(w.$, 'ask', { task: 'T-1', question: 'which?' }))).end).toEqual(['stopped', 'the lead asked the owner a question'])
  expect((await tryEnds(w => runTool(w.$, 'change', { task: 'T-1', backlog: true }))).end).toEqual(['stopped', 'moved to the backlog'])
})

test('a try stopped by turning symcc or the board off says so, and so does a stop during its check', async () => {
  expect((await tryEnds(turnOff)).end).toEqual(['stopped', 'symcc was turned off'])
  expect((await tryEnds(w => setBoardMode(w.$, 'off', 'you'))).end).toEqual(['stopped', 'you turned the board off'])
  // paused while its tests run: the pause is the reason, not the check's "not merged"
  const paused = await tryEnds(async w => {
    let done = false
    w.onRun(async cmd => {
      if (done || !/^\/bin\/sh -c /.test(cmd)) return
      done = true
      await runTool(w.$, 'pause', { task: 'T-1' })
    })
    await workerFinished(w.$, 'ag1', 'made the change')
  })
  expect(paused.t.status).toBe('paused')
  expect(paused.end).toEqual(['stopped', 'paused'])
})

// ---------------- a worker over its time limit (T-251) ----------------

/** Records what is sent to agents (halt's "Stop now", the wrap-up message). */
const sentTo = (w: ReturnType<typeof world>) => {
  const sent: { to: string; text: string }[] = []
  w.$.agents.send = w.$.agents.stop = async (to, text) => void sent.push({ to, text })
  return sent
}
/** T-1's worker (ag1) as started `min` minutes ago. */
const runFor = (min: number) => workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: Date.now() - min * 60_000 })
/** Over-time tests drive the board (check only runs then); world() sets driving off again. */
async function overTime(then: (w: ReturnType<typeof world>, sent: { to: string; text: string }[]) => Promise<unknown>) {
  let sent: { to: string; text: string }[] = []
  try {
    return await tryEnds(async w => {
      S.driving = true
      sent = sentTo(w)
      // ag1 is still running: listed, so the check does not take it as gone (a missing worker fails)
      w.$.agents.list = async () => (workers.has('ag1') ? [{ id: 'ag1', kind: 'worker', status: 'running', description: 'T-1' }] : [])
      await then(w, sent)
    })
  } finally {
    S.driving = false
  }
}

test('at the time limit the worker is not stopped: the task stays doing and the owner is asked, once', async () => {
  let sent: { to: string; text: string }[] = []
  const r = await overTime(async (w, s) => {
    sent = s
    runFor(50)
    await check(w.$)
    expect(workers.has('ag1')).toBe(true)
    await check(w.$) // asked once only
  })
  expect(r.t.status).toBe('doing')
  expect(r.t.note).toBe('over time; asked the owner')
  expect((r.t as BoardTask).time_ask).toBeDefined()
  expect(r.r.ended).toBeUndefined()
  expect(sent).toEqual([])
  expect(r.t.history.filter(h => h.includes('asked the owner for more time'))).toEqual(['try 1: ran 45 min, over its time limit; asked the owner for more time'])
  const told = leadQueue.filter(x => x.includes('T-1 has run 45 min. Give it more time?'))
  expect(told.length).toBe(1)
  expect(told[0]).toContain('+30 min | +60 min | Stop it')
  expect(told[0]).toContain('change T-1 and answer')
})

test('"+30 min" moves the limit later: the worker goes on, is not asked again before it, and finishes normally', async () => {
  let said = ''
  const r = await overTime(async w => {
    runFor(50)
    await check(w.$)
    said = await runTool(w.$, 'change', { task: 'T-1', answer: '+30 min' })
    runFor(70) // past 45, not past 75
    await check(w.$)
    const t = find(await load(w.$), 'T-1') as BoardTask
    expect(t.extra_minutes).toBe(30)
    expect(t.time_ask).toBeUndefined()
    expect(t.status).toBe('doing')
    expect(workers.has('ag1')).toBe(true)
    await workerFinished(w.$, 'ag1', 'made the change')
  })
  expect(said).toBe('T-1 has 30 more minutes: its limit is now 75 min, and its worker goes on.')
  expect(r.t.history).toContain('try 1: the owner gave it 30 more min (limit now 75 min)')
  expect(r.t.status).toBe('done')
  expect(r.end).toEqual(['finished', 'merged'])
  expect((r.t as BoardTask).extra_minutes).toBeUndefined()
})

test('"Stop it" tells the worker to wrap up; its hand-back is saved as the report and the task fails with its work kept', async () => {
  let sent: { to: string; text: string }[] = []
  let w0: ReturnType<typeof world> | undefined
  const r = await overTime(async (w, s) => {
    sent = s
    w0 = w
    runFor(50)
    await check(w.$)
    expect(await runTool(w.$, 'change', { task: 'T-1', answer: 'Stop it' })).toMatch(/^T-1: its worker was told to write down what it has and hand back/)
    const t = find(await load(w.$), 'T-1') as BoardTask
    expect(t.status).toBe('doing')
    expect(t.wrap_up).toBeDefined()
    expect(t.time_ask).toBeUndefined()
    await check(w.$) // within the grace: not stopped yet
    expect(workers.has('ag1')).toBe(true)
    await workerFinished(w.$, 'ag1', 'Did half of it; notes are in docs/notes.md. Left: the tests.')
  })
  expect(sent).toEqual([{ to: 'ag1', text: WRAP_UP_TEXT }])
  expect(r.t.status).toBe('failed')
  expect(r.t.note).toBe('stopped: ran over 45 min; the work so far is in its folder and report, and a retry continues from there')
  expect(r.end).toEqual(['timed out', 'ran over 45 min'])
  expect(r.r.report).toBe('.symcc/reports/T-1-try-1.md')
  expect(String(w0!.files.get(REPORT1))).toContain('Did half of it; notes are in docs/notes.md.')
  expect(w0!.git.main).toBe(M1) // nothing merged
  expect(w0!.calls.some(c => c.includes('worktree remove'))).toBe(false)
  expect(leadQueue.some(x => x.includes('T-1') && x.includes('Its work so far is kept'))).toBe(true)
})

test('no answer by the hard cap (twice the limit) does the same: wrap-up message, then after the grace it is stopped and fails', async () => {
  let sent: { to: string; text: string }[] = []
  const r = await overTime(async (w, s) => {
    sent = s
    runFor(50)
    await check(w.$)
    runFor(91) // past 45 + 45
    await check(w.$)
    expect(sent).toEqual([{ to: 'ag1', text: WRAP_UP_TEXT }])
    expect((find(await load(w.$), 'T-1') as BoardTask).status).toBe('doing')
    // the grace is over: the worker is stopped
    await change(w.$, x => patchTask(x, 'T-1', { wrap_up: new Date(Date.now() - 4 * 60_000).toISOString() }, ISO))
    await check(w.$)
    expect(workers.has('ag1')).toBe(false)
  })
  expect(sent.length).toBe(2)
  expect(sent[1]!.text).toMatch(/^Stop now: its time is up/)
  expect(r.t.status).toBe('failed')
  expect(r.t.note).toBe('stopped: ran over 45 min; the work so far is in its folder and report, and a retry continues from there')
  expect(r.end).toEqual(['timed out', 'ran over 45 min'])
  expect(r.t.history.some(h => /^try 1: time is up \(no answer from the owner after \d+ min\)/.test(h))).toBe(true)
})

test('a worker that finishes before the limit is unchanged: never asked, merged as usual', async () => {
  let sent: { to: string; text: string }[] = []
  const r = await overTime(async (w, s) => {
    sent = s
    runFor(20)
    await check(w.$)
    await workerFinished(w.$, 'ag1', 'made the change')
  })
  expect(sent).toEqual([])
  expect(r.t.status).toBe('done')
  expect(r.end).toEqual(['finished', 'merged'])
  expect(leadQueue.some(x => x.includes('Give it more time?'))).toBe(false)
})

test('the owner\'s answer to "more time?": +N min or stop, anything else is refused', () => {
  expect(parseOvertimeAnswer('+30 min')).toEqual({ add: 30 })
  expect(parseOvertimeAnswer('+60 min')).toEqual({ add: 60 })
  expect(parseOvertimeAnswer('give it +15 minutes')).toEqual({ add: 15 })
  expect(parseOvertimeAnswer('Stop it')).toEqual({ stop: true })
  expect(parseOvertimeAnswer('maybe')).toBeUndefined()
  // a unit after the number: hours count 60 min each, minutes or no unit as minutes, any other unit is refused
  expect(parseOvertimeAnswer('+1 hour')).toEqual({ add: 60 })
  expect(parseOvertimeAnswer('2 hours')).toEqual({ add: 120 })
  expect(parseOvertimeAnswer('+1h')).toEqual({ add: 60 })
  expect(parseOvertimeAnswer('+2 hr')).toEqual({ add: 120 })
  expect(parseOvertimeAnswer('+30')).toEqual({ add: 30 })
  expect(parseOvertimeAnswer('+30 min')).toEqual({ add: 30 })
  expect(parseOvertimeAnswer('45 minutes')).toEqual({ add: 45 })
  expect(parseOvertimeAnswer('3 days')).toBeUndefined()
  expect(parseOvertimeAnswer('+20 hours')).toBeUndefined()
  // decimals, rounded up to whole minutes
  expect(parseOvertimeAnswer('1.5 hours')).toEqual({ add: 90 })
  expect(parseOvertimeAnswer('0.5 h')).toEqual({ add: 30 })
  expect(parseOvertimeAnswer('2.5 min')).toEqual({ add: 3 })
  // filler words between the number and the unit, and around the answer
  expect(parseOvertimeAnswer('30 more minutes')).toEqual({ add: 30 })
  expect(parseOvertimeAnswer('+30 more min')).toEqual({ add: 30 })
  expect(parseOvertimeAnswer('+30 extra minutes')).toEqual({ add: 30 })
  expect(parseOvertimeAnswer('45 more')).toEqual({ add: 45 })
  expect(parseOvertimeAnswer('1 more hour')).toEqual({ add: 60 })
  expect(parseOvertimeAnswer('+1 extra hour')).toEqual({ add: 60 })
  expect(parseOvertimeAnswer('give it 30 more minutes')).toEqual({ add: 30 })
  expect(parseOvertimeAnswer('another 20 min please')).toEqual({ add: 20 })
  expect(parseOvertimeAnswer('please give it 10 additional minutes.')).toEqual({ add: 10 })
  // other units and left-over words are refused, not skipped
  expect(parseOvertimeAnswer('2 weeks')).toBeUndefined()
  expect(parseOvertimeAnswer('3 more days')).toBeUndefined()
  expect(parseOvertimeAnswer('30 min then stop')).toBeUndefined()
  expect(parseOvertimeAnswer('1.5.2 hours')).toBeUndefined()
  // only a whole stop answer stops the worker (case and punctuation ignored)
  for (const s of ['stop', 'Stop!', 'stop it', 'STOP NOW.', 'no', 'No.', 'no more', 'no more time', 'end it', 'fail it', 'Stop it'])
    expect(parseOvertimeAnswer(s)).toEqual({ stop: true })
  // a stop-like word inside a longer answer does not stop: the amount counts
  expect(parseOvertimeAnswer('no rush, give it another hour')).toEqual({ add: 60 })
  expect(parseOvertimeAnswer('no problem, +30 min')).toEqual({ add: 30 })
  expect(parseOvertimeAnswer('ending soon? give it 20 min')).toEqual({ add: 20 })
  expect(parseOvertimeAnswer('an hour')).toEqual({ add: 60 })
  expect(parseOvertimeAnswer('another hour')).toEqual({ add: 60 })
  expect(parseOvertimeAnswer('give it half an hour')).toEqual({ add: 30 })
  // a stop phrase with an amount, or neither, is refused
  expect(parseOvertimeAnswer('stop in 30 min')).toBeUndefined()
  expect(parseOvertimeAnswer('give it an hour then stop')).toBeUndefined()
  expect(parseOvertimeAnswer('no rush')).toBeUndefined()
  expect(parseOvertimeAnswer('endless')).toBeUndefined()
  expect(parseOvertimeAnswer('not yet')).toBeUndefined()
  expect(parseOvertimeAnswer('nope, stop it')).toBeUndefined()
})

test('a worker whose agent ended is failed only on a later check, unless its report arrived in between', async () => {
  try {
    // still not handed back on the second check: failed
    const lost = await tryEnds(async w => {
      S.driving = true // world() sets it to false
      ;w.$.agents.list = async () => [{ id: 'ag1', kind: 'other', status: 'completed' }]
      workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: Date.now() - 5 * 60_000 })
      await check(w.$)
      expect(workers.has('ag1')).toBe(true)
      expect(find(await load(w.$), 'T-1')!.status).toBe('doing')
      await check(w.$)
      expect(workers.has('ag1')).toBe(false)
    })
    expect(lost.t.status).toBe('failed')
    expect(lost.t.note).toBe('the worker ended without a result')
    expect(lost.end).toEqual(['stopped', 'the worker ended without a result'])
    // the report arrives between the two checks: merged, not failed
    const late = await tryEnds(async w => {
      S.driving = true
      ;w.$.agents.list = async () => [{ id: 'ag1', kind: 'other', status: 'completed' }]
      workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: Date.now() - 5 * 60_000 })
      await check(w.$)
      await workerFinished(w.$, 'ag1', 'made the change')
      await check(w.$)
    })
    expect(late.t.status).not.toBe('failed')
    expect(late.end).toEqual(['finished', 'merged'])
  } finally {
    S.driving = false
  }
})

test('the merge-main-in try is marked when it starts, and the first end reason is kept', async () => {
  const runs = startRun([], ISO, true)
  expect(runs[0]!.merge_main).toBe(true)
  expect(startRun([], ISO)[0]!.merge_main).toBeUndefined()
  const once = withEnd(runs, 'stopped', 'paused')
  expect(withEnd(once, 'finished', 'merged')[0]).toEqual(once[0])
  expect(withEnd(once, 'finished', 'merged', true)[0]!.ended_note).toBe('merged')
  expect(fmtRun({ ...once[0]!, ended: ISO }, 2)).toBe('try 3: 0s · merged main in (clash with main) · stopped: paused')
})

test('a worker may write and run a throwaway script under .scratch/ with no file request; the commit and scope check leave it out, and the folder is emptied after the try (T-456)', async () => {
  S.me = 'me'
  // the staged list holds a file under .scratch/ too (the second safeguard, T-477); the branch's changes do not
  let staged = ['src/a.ts', 'src/a.test.ts', '.scratch/edit.py']
  const w = world({
    answer: a => {
      if (a[0] === 'restore' && a.includes('--staged')) return (staged = staged.filter(f => !a.includes(`:(literal)${f}`))), ok()
      if (a[0] === 'diff' && a.includes('--cached')) return ok(staged.join('\0'))
      return undefined
    },
  })
  const [b] = boardWith('auto', ['npm test'], { agent: 'ag1', session: 'me', runs: [{ started: ISO }] } as Partial<BoardTask>)
  await saveBoard(w.$, b)
  w.put(`${WT}/.git`, 'gitdir: x')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  // the Write tool, by full and by relative path, then Bash runs it: all allowed
  expect(await checkEdit(w.$, 'ag1', { path: `${WT}/.scratch/edit.py` })).toBeUndefined()
  expect(await checkEdit(w.$, 'ag1', { path: '.scratch/notes/plan.md' })).toBeUndefined()
  expect(await checkEdit(w.$, 'ag1', { command: 'python3 .scratch/edit.py' }, WT)).toBeUndefined()
  expect(await checkEdit(w.$, 'ag1', { command: `python3 ${WT}/.scratch/edit.py && rm ${WT}/.scratch/edit.py` }, WT)).toBeUndefined()
  // no file request was recorded
  expect((find(await load(w.$), 'T-1') as BoardTask).try_refused).toBeUndefined()
  // elsewhere outside the task's files is still refused: a look-alike folder, a climb out of .scratch/, a top-level script
  expect(await checkEdit(w.$, 'ag1', { path: `${WT}/.t448-edit.py` })).toMatch(/^\.t448-edit\.py is outside this task's files/)
  expect(await checkEdit(w.$, 'ag1', { path: `${WT}/.scratchy/edit.py` })).toMatch(/^\.scratchy\/edit\.py is outside this task's files/)
  expect(await checkEdit(w.$, 'ag1', { path: `${WT}/.scratch/../README.md` })).toMatch(/^README\.md is outside this task's files/)
  expect((find(await load(w.$), 'T-1') as BoardTask).try_refused).toEqual(['.t448-edit.py', '.scratchy/edit.py', 'README.md'])
  // the try, without those refusals: its commit never stages .scratch/, it merges, and the folder is emptied afterwards
  await change(w.$, x => patchTask(x, 'T-1', { try_refused: undefined }, ISO))
  await workerFinished(w.$, 'ag1', 'made the change')
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  // the add is plain (T-477: real git refuses a pathspec naming an ignored path); anything under .scratch/ that was
  // still staged is unstaged before the commit, so it never reaches it
  const add = w.calls.indexOf(`wt: git add -A -- .`)
  expect(add).toBeGreaterThan(-1)
  expect(w.calls.some(c => c.includes(':(exclude)'))).toBe(false)
  const restore = w.calls.indexOf(`wt: git restore --staged -- :(literal).scratch/edit.py`)
  expect(restore).toBeGreaterThan(add)
  expect(w.calls.findIndex(c => c.startsWith('wt: git') && c.includes(' commit '))).toBeGreaterThan(restore)
  expect(w.calls.some(c => c.includes('restore --staged') && c.includes('src/a.ts'))).toBe(false)
  expect(t.history.join('\n')).not.toContain('outside the task')
  const rm = w.calls.indexOf(`rm -rf ${WT}/.scratch`)
  expect(rm).toBeGreaterThan(add)
  expect(w.calls[rm - 1]).toBe(`wt: git check-ignore -q -- .scratch/x`)
  workers.clear()
})

test('a project that keeps files under .scratch/ in git: an edit there gets the normal file check, git add has no exclude, and the folder is not emptied (T-456)', async () => {
  S.me = 'me'
  const w = world({ answer: a => (a[0] === 'ls-files' && a.includes('.scratch') ? ok('.scratch/keep.txt') : undefined) })
  const [b] = boardWith('auto', ['npm test'], { agent: 'ag1', session: 'me', runs: [{ started: ISO }] } as Partial<BoardTask>)
  await saveBoard(w.$, b)
  w.put(`${WT}/.git`, 'gitdir: x')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  expect(await checkEdit(w.$, 'ag1', { path: `${WT}/.scratch/keep.txt` })).toMatch(/^\.scratch\/keep\.txt is outside this task's files/)
  expect((find(await load(w.$), 'T-1') as BoardTask).try_refused).toEqual(['.scratch/keep.txt'])
  await change(w.$, x => patchTask(x, 'T-1', { try_refused: undefined }, ISO))
  await workerFinished(w.$, 'ag1', 'made the change')
  expect(find(await load(w.$), 'T-1')!.status).toBe('done')
  expect(w.calls).toContain('wt: git add -A -- .')
  expect(w.calls.some(c => c.includes(':(exclude).scratch'))).toBe(false)
  expect(w.calls.some(c => c.startsWith('rm ') && c.includes('.scratch'))).toBe(false)
  workers.clear()
})

test("a worker's edit in the owner's copy of the project is refused without a file request; its own folder works as before (T-299)", async () => {
  S.me = 'me'
  const f = world()
  const [b] = boardWith('auto', ['npm test'], { agent: 'ag1', session: 'me', runs: [{ started: ISO }] } as Partial<BoardTask>)
  await saveBoard(f.$, b)
  f.put(`${WT}/.git`, 'gitdir: x')
  const wt5 = `${ROOT}/.symcc/worktrees/T-5`
  workers.set('ag1', { task: 'T-1', worktree: wt5, branch: 'symcc/T-1', since: T0 })
  expect(await checkEdit(f.$, 'ag1', { path: `${ROOT}/README.md` })).toMatch(/^Refused: README\.md is in the owner's copy of the project.*edit .*T-5\/README\.md instead/)
  expect(await checkEdit(f.$, 'ag1', { path: `${ROOT}/.symcc/board.json` })).toMatch(/^Refused: \.symcc\/board\.json is symcc's own data.*not yours to edit/)
  expect(await checkEdit(f.$, 'ag1', { path: '../../README.md' })).toMatch(/^Refused: \.symcc\/README\.md is symcc's own data.*not yours to edit/)
  expect(await checkEdit(f.$, 'ag1', { path: '/tmp/scratch.txt' })).toBeUndefined()
  // none of these became a file request
  expect((find(await load(f.$), 'T-1') as BoardTask).try_refused).toBeUndefined()
  // inside its own folder: in scope is allowed, out of scope is still a file request
  expect(await checkEdit(f.$, 'ag1', { path: `${wt5}/src/a.ts` })).toBeUndefined()
  expect(await checkEdit(f.$, 'ag1', { path: 'src/b.ts' })).toBeUndefined()
  expect(await checkEdit(f.$, 'ag1', { path: `${wt5}/README.md` })).toMatch(/README\.md is outside this task's files/)
  expect((find(await load(f.$), 'T-1') as BoardTask).try_refused).toEqual(['README.md'])
  workers.clear()
})

test("with a data folder other than .symcc, a worker's edit under it is refused as not yours to edit (T-312)", async () => {
  S.me = 'me'
  const f = world()
  const [b] = boardWith('auto', ['npm test'], { agent: 'ag1', session: 'me', runs: [{ started: ISO }] } as Partial<BoardTask>)
  await saveBoard(f.$, b)
  const was = S.N
  S.N = { ...was, dir: '.other' }
  try {
    workers.set('ag1', { task: 'T-1', worktree: `${ROOT}/.other/worktrees/T-1`, branch: 'symcc/T-1', since: T0 })
    expect(await checkEdit(f.$, 'ag1', { path: `${ROOT}/.other/board.json` })).toMatch(/^Refused: \.other\/board\.json is symcc's own data.*not yours to edit/)
    expect(await checkEdit(f.$, 'ag1', { path: `${ROOT}/.other/worktrees/T-9/a.ts` })).toMatch(/^Refused: \.other\/worktrees\/T-9\/a\.ts is another worker's copy.*not yours to edit/)
  } finally {
    S.N = was
    workers.clear()
  }
})

test("a worker's edit through a symbolic link into the owner's copy is refused; links elsewhere are judged by where they lead (T-303)", async () => {
  S.me = 'me'
  const f = world()
  const [b] = boardWith('auto', ['npm test'], { agent: 'ag1', session: 'me', runs: [{ started: ISO }] } as Partial<BoardTask>)
  await saveBoard(f.$, b)
  const wt5 = `${ROOT}/.symcc/worktrees/T-5`
  const disk = fakeDisk({
    [ROOT]: 'dir',
    [`${ROOT}/README.md`]: 'file',
    [`${ROOT}/.symcc`]: 'dir',
    [`${ROOT}/.symcc/worktrees`]: 'dir',
    [wt5]: 'dir',
    [`${wt5}/src`]: 'dir',
    [`${wt5}/link`]: `-> ${ROOT}`,
    [`${wt5}/scratch`]: '-> /tmp/x2',
    [`${wt5}/broken`]: `-> ${ROOT}/NEW.md`,
    '/tmp': 'dir',
    '/tmp/x2': 'dir',
  })
  const fs = (f.$ as unknown as { fs: Record<string, unknown> }).fs
  const plainStat = fs.stat as (p: string) => Promise<unknown>
  fs.stat = async (p: string, o?: { resolve?: boolean }) => {
    if (!o?.resolve) return plainStat(p)
    const realPath = await disk.real(p)
    if (realPath === undefined) throw new Error(`ENOENT ${p}`)
    return { kind: 'file', size: 0, mtimeMs: 0, isLink: false, realPath }
  }
  fs.list = async (d: string) => disk.list(d).map(e => ({ ...e, kind: e.isLink ? 'other' : 'file', size: 0, mtimeMs: 0 }))
  workers.set('ag1', { task: 'T-1', worktree: wt5, branch: 'symcc/T-1', since: T0 })
  expect(await checkEdit(f.$, 'ag1', { path: `${wt5}/link/README.md` })).toMatch(/^Refused: README\.md is in the owner's copy of the project.*edit .*T-5\/README\.md instead/)
  expect(await checkEdit(f.$, 'ag1', { path: 'link/.symcc/board.json' })).toMatch(/^Refused: \.symcc\/board\.json is symcc's own data.*not yours to edit/)
  expect(await checkEdit(f.$, 'ag1', { path: `${wt5}/broken` })).toMatch(/^Refused: .*broken goes through a symbolic link that leads to nothing/)
  expect(await checkEdit(f.$, 'ag1', { path: `${wt5}/scratch/notes.txt` })).toBeUndefined()
  expect(await checkEdit(f.$, 'ag1', { path: `${wt5}/src/new/b.ts` })).toBeUndefined()
  expect(await checkEdit(f.$, 'ag1', { path: `${wt5}/README.md` })).toMatch(/README\.md is outside this task's files/)
  expect((find(await load(f.$), 'T-1') as BoardTask).try_refused).toEqual(['README.md'])
  // the same links in Bash: a read through a link inside the worker's folder is refused like the edit (T-436)
  const bash = (command: string, cwd?: string) => checkEdit(f.$, 'ag1', { command }, cwd)
  expect(await bash(`cat ${wt5}/link/README.md`)).toMatch(/^Refused: this command names README\.md in the owner's copy/)
  expect(await bash('cat link/README.md')).toMatch(/^Refused: this command names README\.md in the owner's copy/)
  expect(await bash('cat "link/README.md"')).toMatch(/^Refused: this command names README\.md in the owner's copy/)
  expect(await bash('cd link && cat README.md')).toMatch(/^Refused: this command names the project folder in the owner's copy/)
  expect(await bash('cd src && cat ../link/.symcc/worktrees/T-6/a.ts')).toMatch(/names \.symcc\/worktrees\/T-6\/a\.ts/)
  expect(await bash('cat README.md', `${wt5}/link`)).toMatch(/names README\.md in the owner's copy/)
  expect(await bash(`python3 - <<'EOF'\nprint(open('link/README.md').read())\nEOF`)).toMatch(/names README\.md in the owner's copy/)
  // wildcards: the folder part before the first wildcard piece is looked up, so a link there is followed too
  for (const glob of ['cat link/*.md', 'cat link/R?ADME.md', 'cat link/[R]EADME.md', 'cat ./link/README*', 'head -n1 link/READM*', 'cat "link"/*.md'])
    expect(await bash(glob), glob).toMatch(/^Refused: this command names the project folder in the owner's copy/)
  expect(await bash('cat src/*.ts scratch/*.txt *.md')).toBeUndefined()
  // links that lead elsewhere, a link that leads nowhere, and the worker's own files: allowed
  expect(await bash('cat scratch/notes.txt broken src/a.ts && ls src')).toBeUndefined()
  expect(await bash(`cat ${wt5}/src/a.ts`)).toBeUndefined()
  // too many paths to look up: refused, not cut short
  expect(await bash(`cat ${Array.from({ length: BASH_PATHS_MAX }, (_, i) => `f${i}`).join(' ')} link/README.md`)).toBe(bashTooManyText(wt5))
  // ordinary long commands main allowed are still allowed, and only paths that may go through a link are looked up
  // the slow way: one folder listing each, not a lookup per path (T-436)
  let slow = 0
  const realStat = fs.stat as (p: string, o?: { resolve?: boolean }) => Promise<unknown>
  fs.stat = async (p: string, o?: { resolve?: boolean }) => (o?.resolve && slow++, realStat(p, o))
  const files = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i)).join(' ')
  expect(await bash(`rm ${files(129, i => `f${i}.txt`)}`)).toBeUndefined()
  expect(await bash(`cat ${files(130, i => `src/f${i}.ts`)}`)).toBeUndefined()
  expect(await bash(`cat > notes.md <<'EOF'\n${Array.from({ length: 130 }, (_, i) => `- see docs/x${i}.md`).join('\n')}\nEOF`)).toBeUndefined()
  expect(await bash(`cat > src/m.ts <<'EOF'\n${Array.from({ length: 130 }, (_, i) => `import m${i} from './hooks/m${i}'`).join('\n')}\nEOF`)).toBeUndefined()
  expect(await bash(`cd src; cd a; cd b; cd c; cat ${files(9, i => `f${i}`)}`)).toBeUndefined()
  expect(await bash(`${Array.from({ length: 17 }, (_, i) => `cd d${i}`).join(' && ')} && cat x`)).toBeUndefined()
  expect(await bash(`cat ${files(1999, i => `src/f${i}.ts`)}`)).toBeUndefined()
  const looked = slow
  // the folder lookups of the worker's own folder and the project, not one per path (counted before the timed call).
  // This count is what catches the old slow way (a lookup per path), so no tight time limit is needed (T-478)
  expect(looked).toBeLessThan(30)
  // and a generous time cap only: the work is not linear in the paths (4 times the paths took about 20 times as long
  // under load), so a growth ratio would flake; the fastest of 3 runs keeps one busy moment from counting
  const big = await bestMsOfAsync(() => bash(`cat ${files(1999, i => `src/f${i}.ts`)}`))
  expect(big).toBeLessThan(SPEED_CAP_MS)
  // a link among many plain paths is still followed
  expect(await bash(`cat ${files(500, i => `src/f${i}.ts`)} link/README.md`)).toMatch(/names README\.md in the owner's copy/)
  fs.stat = realStat
  workers.clear()
})

test("a worker's Bash naming the owner's copy through a symbolic link elsewhere is refused; a link into its own folder or elsewhere is not (T-417)", async () => {
  S.me = 'me'
  const f = world()
  const [b] = boardWith('auto', ['npm test'], { agent: 'ag1', session: 'me', runs: [{ started: ISO }] } as Partial<BoardTask>)
  await saveBoard(f.$, b)
  const wt5 = `${ROOT}/.symcc/worktrees/T-5`
  const disk = fakeDisk({
    [ROOT]: 'dir',
    [`${ROOT}/README.md`]: 'file',
    [`${ROOT}/.symcc`]: 'dir',
    [`${ROOT}/.symcc/worktrees`]: 'dir',
    [wt5]: 'dir',
    [`${wt5}/src`]: 'dir',
    '/home': 'dir',
    '/home/me': 'dir',
    '/home/me/link': `-> ${ROOT}`,
    '/home/me/mine': `-> ${wt5}`,
    '/home/me/out': '-> /tmp/x2',
    '/tmp': 'dir',
    '/tmp/x2': 'dir',
  })
  const fs = (f.$ as unknown as { fs: Record<string, unknown> }).fs
  const plainStat = fs.stat as (p: string) => Promise<unknown>
  fs.stat = async (p: string, o?: { resolve?: boolean }) => {
    if (!o?.resolve) return plainStat(p)
    const realPath = await disk.real(p)
    if (realPath === undefined) throw new Error(`ENOENT ${p}`)
    return { kind: 'file', size: 0, mtimeMs: 0, isLink: false, realPath }
  }
  fs.list = async (d: string) => disk.list(d).map(e => ({ ...e, kind: e.isLink ? 'other' : 'file', size: 0, mtimeMs: 0 }))
  workers.set('ag1', { task: 'T-1', worktree: wt5, branch: 'symcc/T-1', since: T0 })
  const bash = (command: string) => checkEdit(f.$, 'ag1', { command })
  expect(await bash('cat /home/me/link/README.md')).toMatch(/^Refused: this command names README\.md in the owner's copy/)
  expect(await bash('test -e /home/me/link/.symcc/worktrees/T-6/a.ts')).toMatch(/names \.symcc\/worktrees\/T-6\/a\.ts/)
  expect(await bash('cat /home/me/link/.symcc/worktrees/T-5/src/a.ts')).toBeUndefined()
  expect(await bash('cat /home/me/mine/src/a.ts && ls /home/me/out/notes')).toBeUndefined()
  expect(await bash('cd tests && cat ../hooks/claude/tools.ts')).toBeUndefined()
  // a disk that can't be read changes nothing: the paths are judged as written
  fs.stat = async () => {
    throw new Error('no disk')
  }
  expect(await bash('cat /home/me/link/README.md')).toBeUndefined()
  expect(await bash(`cat ${ROOT}/README.md`)).toMatch(/^Refused: this command names README\.md/)
  workers.clear()
})

test("a worker's Bash command reaching the owner's copy is refused; its own folder, /tmp and the lead are not (T-302)", async () => {
  S.me = 'me'
  const f = world()
  const [b] = boardWith('auto', ['npm test'], { agent: 'ag1', session: 'me', runs: [{ started: ISO }] } as Partial<BoardTask>)
  await saveBoard(f.$, b)
  const wt5 = `${ROOT}/.symcc/worktrees/T-5`
  workers.set('ag1', { task: 'T-1', worktree: wt5, branch: 'symcc/T-1', since: T0 })
  const bash = (agent: string | undefined, command: string) => checkEdit(f.$, agent, { command })
  for (const c of [`echo x > ${ROOT}/README.md`, `cp a ${ROOT}/.symcc/board.json`, `cd ${ROOT} && git commit -m x`, 'echo x > ../../README.md'])
    expect(await bash('ag1', c)).toMatch(/^Refused: this command names .* outside your own folder/)
  for (const c of ['echo x > /tmp/a', 'echo x > src/a.ts', 'bun test', `cat ${wt5}/src/a.ts`]) expect(await bash('ag1', c)).toBeUndefined()
  // no file request was recorded for any of them
  expect((find(await load(f.$), 'T-1') as BoardTask).try_refused).toBeUndefined()
  // the lead (no agent) and an agent that is not a worker are never refused
  expect(await bash(undefined, `echo x > ${ROOT}/README.md`)).toBeUndefined()
  expect(await bash('nobody', `echo x > ${ROOT}/README.md`)).toBeUndefined()
  workers.clear()
})

test("a worker's git writes in its own folder are refused like a checker's; read-only git and the merge-it-in step still work (T-432)", async () => {
  S.me = 'me'
  const f = world()
  const [b] = boardWith('auto', ['npm test'], { agent: 'ag1', session: 'me', runs: [{ started: ISO }] } as Partial<BoardTask>)
  await saveBoard(f.$, b)
  const wt5 = `${ROOT}/.symcc/worktrees/T-5`
  workers.set('ag1', { task: 'T-1', worktree: wt5, branch: 'symcc/T-1', since: T0 })
  const bash = (command: string) => checkEdit(f.$, 'ag1', { command })
  for (const [command, what] of [
    ['git commit -am x', 'git commit'],
    ['git update-ref refs/heads/main HEAD', 'git update-ref'],
    ['git push . HEAD:main', 'git push'],
    ['git merge main', 'git merge'],
    ['git add -A && git commit -m x', 'git add'],
    ['git reset --hard HEAD~1', 'git reset'],
    ['git checkout main', 'git checkout'],
    ['git switch -c x', 'git switch'],
    ['git branch -f main HEAD', 'git branch'],
    ['git tag v1', 'git tag'],
    ['git stash', 'git stash'],
    ['git rebase main', 'git rebase'],
    ['git worktree add /tmp/x main', 'git worktree'],
    ['git merge --abort', 'git merge'],
    ['sh -c "git update-ref refs/heads/main HEAD"', 'git update-ref'],
    ['/usr/libexec/git-core/git-update-ref refs/heads/main HEAD', 'git update-ref'],
  ] as const) expect(await bash(command)).toBe(workerGitWriteText(what))
  expect(workerGitWriteText('git commit')).toMatch(/^Refused: git commit may change the repository .*a worker may only read with git/)
  expect(workerGitWriteText('git commit')).not.toMatch(/In this try you may/)
  for (const command of ['git status', 'git diff', 'git log --oneline -5', 'git show HEAD', 'git diff main...HEAD && git blame src/a.ts', 'git branch --list', 'git stash list', 'bun test', 'echo "use git diff"'])
    expect(await bash(command)).toBeUndefined()
  // a path in the owner's copy is still refused for that first
  expect(await bash(`cd ${ROOT} && git commit -m x`)).toMatch(/^Refused: this command names .* outside your own folder/)
  // the merge-it-in try (its task conflicted with main): git merge main and --abort pass, nothing else does
  await saveBoard(f.$, patchTask(b, 'T-1', { merge_main: true }, ISO))
  for (const command of ['git merge main', 'git merge --no-edit main 2>&1 | tail -20', 'git merge --abort', 'git status && git diff'])
    expect(await bash(command)).toBeUndefined()
  for (const [command, what] of [
    ['git merge other', 'git merge'],
    ['git merge -m x main', 'git merge'],
    ['git merge main && git commit -am x', 'git commit'],
    ['git update-ref refs/heads/main HEAD', 'git update-ref'],
    ['git add -A', 'git add'],
  ] as const) expect(await bash(command)).toBe(workerGitWriteText(what, 'main'))
  expect(workerGitWriteText('git commit', 'main')).toMatch(/In this try you may also run `git merge main`/)
  // a task that merges into another branch may merge only that one
  await saveBoard(f.$, patchTask(b, 'T-1', { merge_main: true, merge_into: 'dev' } as Partial<BoardTask>, ISO))
  expect(await bash('git merge dev')).toBeUndefined()
  expect(await bash('git merge main')).toBe(workerGitWriteText('git merge', 'dev'))
  // no file request was recorded for any of them
  expect((find(await load(f.$), 'T-1') as BoardTask).try_refused).toBeUndefined()
  // the lead and agents that are not workers are never refused
  expect(await checkEdit(f.$, undefined, { command: 'git commit -am x' })).toBeUndefined()
  expect(await checkEdit(f.$, 'nobody', { command: 'git commit -am x' })).toBeUndefined()
  workers.clear()
})

test('after a reload (no worker in memory), an edit outside the files is still refused and recorded, found from the board (T-293)', async () => {
  S.me = 'me'
  workers.clear()
  const f = world()
  const [b] = boardWith('auto', ['npm test'], { agent: 'ag1', session: 'me', runs: [{ started: ISO }] } as Partial<BoardTask>)
  await saveBoard(f.$, b)
  f.put(`${WT}/.git`, 'gitdir: x')
  expect(await checkEdit(f.$, 'ag1', { path: `${WT}/README.md` })).toMatch(/README\.md is outside this task's files/)
  expect((find(await load(f.$), 'T-1') as BoardTask).try_refused).toEqual(['README.md'])
  // an agent the board doesn't know: nothing refused, no failure
  expect(await checkEdit(f.$, 'nobody', { path: `${WT}/README.md` })).toBeUndefined()
  workers.clear()
})

test('a try sent back to todo after a reload ends as restarted, worded like its history line', () => {
  const [, t] = boardWith('auto', [], { history: [], runs: [{ started: ISO }] })
  const back = backToTodo(t, 'restarted: the plugin reloaded and the old worker was gone', '2026-11-13T00:05:00.000Z')
  expect(back.history.at(-1)).toBe('try 1: restarted: the plugin reloaded and the old worker was gone')
  expect(back.runs![0]).toEqual({ started: ISO, ended: '2026-11-13T00:05:00.000Z', ended_by: 'restarted', ended_note: 'the plugin reloaded and the old worker was gone' })
  expect(backToTodo({ ...t, status: 'todo' }, 'restarted: x', ISO).runs).toEqual([{ started: ISO }])
})

test('the outcome of a check in a few words', () => {
  expect(finishedNote({ ok: false, detail: 'checking failed: boom' })).toBe('checking failed')
  expect(finishedNote({ ok: false, detail: 'the worker made no change' })).toBe('no change')
  expect(finishedNote({ ok: false, detail: 'main is checked out with uncommitted changes' })).toBe('not merged')
})

test("the lead's board tool with a task shows its latest report and lists the older tries' reports", async () => {
  const w = world()
  const [b] = boardWith('auto', [], { attempts: 2, runs: [{ started: ISO, report: '.symcc/reports/T-1-try-1.md' }, { started: ISO, report: '.symcc/reports/T-1-try-2.md' }] })
  await saveBoard(w.$, b)
  w.put(`${ROOT}/.symcc/reports/T-1-try-1.md`, 'first try\n')
  w.put(`${ROOT}/.symcc/reports/T-1-try-2.md`, 'I changed src/a.ts and the tests pass.\n')
  const out = await runTool(w.$, 'board', { task: 'T-1' })
  expect(out).toContain('Report (try 2, .symcc/reports/T-1-try-2.md):\n  I changed src/a.ts and the tests pass.')
  expect(out).toContain("Older tries' reports:\n  try 1: .symcc/reports/T-1-try-1.md")
  expect(out).not.toContain('first try')
  // and the list view takes status and search
  expect(await runTool(w.$, 'board', { status: ['done'] })).toContain('No tasks match (status: done).')
  expect(await runTool(w.$, 'board', { search: 'do it' })).toContain('Do it')
  await expect(runTool(w.$, 'board', { status: ['nope'] })).rejects.toThrow('unknown status')
})

// ---------------- the step shown in the list while a finished task is checked (T-238) ----------------

test('a finishing task\'s row says "test" while its tests run and "merge" while main is moved; the step is gone once it is done', async () => {
  const cell = async (w: ReturnType<typeof world>) => statusCell(find(await load(w.$), 'T-1')!, Date.now())
  const a = await finishing(cell)
  expect(a.said[0]).toBe('test')
  expect(a.t.status).toBe('done')
  expect(a.t.checking).toBeUndefined()
  const b = await finishing(cell, {}, /git update-ref/)
  expect(b.said[0]).toBe('merge')
  expect(b.t.checking).toBeUndefined()
})

test('the check step is cleared when the tests fail', async () => {
  const { t } = await finishing(async () => undefined, { 'npm test': { exitCode: 1, stdout: 'FAIL a.test', stderr: '' } })
  expect(t.status).not.toBe('doing')
  expect(t.checking).toBeUndefined()
})

test('approve shows "merge" while it moves main, and the step is gone once it is done', async () => {
  const w = await inReview()
  let seen = ''
  w.onRun(async cmd => {
    if (!seen && /git update-ref/.test(cmd)) seen = statusCell(find(await load(w.$), 'T-1')!, Date.now())
  })
  await runTool(w.$, 'approve', { task: 'T-1' })
  expect(seen).toBe('merge')
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.checking).toBeUndefined()
})

// ---------------- a plugin reload while a task's work is tested and merged (T-169) ----------------

const LEAD = `${ROOT}/.symcc/lead.json`
/** T-1's try-`n` commit message, with its trailers (see commitMessage). */
const t1Commit = (n = 1) => commitMessage({ id: 'T-1', title: 'Do it', attempts: n, origin: { by: 'lead', why: 'a test', at: ISO } })
/** A fake reload of the plugin: this copy's memory of what it is checking is gone; the old finish still runs. */
const forget = () => finishingSet.clear()

test('a reload while a task is being tested and merged leaves it "doing"; it merges once and is done, with no restart or "too late" line', async () => {
  S.me = 'me'
  let during: BoardTask | undefined
  let spawned = 0
  const { w, t } = await finishing(async w => {
    ;w.$.agents.spawn = async () => (spawned++, { agentId: 'ag2' })
    w.put(LEAD, leadText('me', Date.now()))
    forget()
    await claimLead(w.$, true)
    during = find(await load(w.$), 'T-1')
    // nothing new starts for it meanwhile
    await startWorker(w.$, 'T-1')
  })
  expect(during!.status).toBe('doing')
  expect(during!.finishing).toBeDefined()
  expect(spawned).toBe(0)
  expect(t.status).toBe('done')
  expect(t.finishing).toBeUndefined()
  expect(w.calls.filter(c => / git update-ref .*refs\/heads\/main/.test(c)).length).toBe(1)
  expect(t.history.join('\n')).not.toMatch(/restarted|too late/)
  expect(t.attempts).toBe(1)
})

test('a reload with the old worker really gone and no merge going on sends the task back to "todo" as before', async () => {
  S.me = 'me'
  const w = world()
  const [b] = boardWith('auto', [], { session: 'me', history: [], runs: [{ started: ISO }] })
  await saveBoard(w.$, b)
  w.put(LEAD, leadText('me', Date.now()))
  await claimLead(w.$, true)
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('todo')
  expect(t.history.at(-1)).toBe('try 1: restarted: the plugin reloaded and the old worker was gone')
})

test('resetDoing keeps a task with a fresh finishing mark, sends back one with a stale mark, and marks a try that merged done', () => {
  const nowMs = Date.parse(ISO)
  const [b0] = boardWith('auto', [], { session: 'me', history: [] })
  let b = patchTask(b0, 'T-1', { finishing: ISO }, ISO)
  expect(resetDoing(b, 'me', null, nowMs + 60_000, 'restarted: x', ISO).tasks[0]!.status).toBe('doing')
  expect(resetDoing(b, 'me', null, nowMs + 10 * 60_000, 'restarted: x', ISO).tasks[0]!.status).toBe('todo')
  b = patchTask(b0, 'T-1', { merged: H1, runs: [{ started: ISO, commits: [H1] }] }, ISO)
  const done = resetDoing(b, 'me', null, nowMs, 'restarted: x', ISO).tasks[0]!
  expect(done.status).toBe('done')
  expect(done.history.at(-1)).toBe(`try 1: its work was already merged into main (${H1.slice(0, 8)}) when it was about to be sent back to todo, so it is done`)
  expect(done.runs![0]!.ended_note).toBe('merged')
})

test('the regular check: a finishing mark no longer refreshed (its copy is gone) is recovered: done when its work is merged, else back to "todo"', async () => {
  S.me = 'me'
  const old = new Date(Date.now() - 10 * 60_000).toISOString()
  for (const merged of [true, false]) {
    const w = world({ answer: (args) => {
      if (args.join(' ') === 'rev-parse -q --verify refs/heads/symcc/T-1') return ok(H1)
      if (args[0] === 'log' && args.at(-1) === H1) return ok(t1Commit(1))
      if (args[0] === 'merge-base' && args[1] === '--is-ancestor' && args[2] === H1) return merged ? ok() : fail()
      return undefined
    } })
    const [b] = boardWith('auto', [], { session: 'other-dead-session', branch: 'symcc/T-1', history: [], runs: [{ started: ISO }], finishing: old })
    await saveBoard(w.$, b)
    S.driving = true
    await check(w.$)
    const t = find(await load(w.$), 'T-1')!
    expect(t.status).toBe(merged ? 'done' : 'todo')
    expect(t.finishing).toBeUndefined()
    if (merged) expect(t.merged).toBe(H1)
    else expect(t.history.at(-1)).toBe('try 1: restarted: its test and merge stopped before the end (the plugin reloaded)')
  }
  S.driving = false
})

test('the regular check leaves a task alone while its finishing mark is fresh', async () => {
  S.me = 'me'
  const w = world()
  const [b] = boardWith('auto', [], { session: 'me', history: [], runs: [{ started: ISO }], finishing: new Date().toISOString() })
  await saveBoard(w.$, b)
  S.driving = true
  await check(w.$)
  S.driving = false
  expect(find(await load(w.$), 'T-1')!.status).toBe('doing')
})

test('a task sent back after its try already merged is done, not started again (T-162)', async () => {
  S.me = 'me'
  let spawned = 0
  const w = world({ answer: (args) => {
    if (args.join(' ') === 'rev-parse -q --verify refs/heads/symcc/T-1') return ok(H1)
    if (args[0] === 'log' && args.at(-1) === H1) return ok(t1Commit(1))
    if (args[0] === 'merge-base' && args[1] === '--is-ancestor' && args[2] === H1) return ok()
    return undefined
  } })
  ;w.$.agents.spawn = async () => (spawned++, { agentId: 'ag2' })
  const [b0] = boardWith('auto', [], { session: 'me', branch: 'symcc/T-1', history: [], runs: [{ started: ISO }] })
  const b = { ...b0, tasks: [backToTodo(b0.tasks[0]!, 'restarted: the plugin reloaded and the old worker was gone', ISO)] }
  await saveBoard(w.$, b)
  await startWorker(w.$, 'T-1')
  const t = find(await load(w.$), 'T-1')!
  expect(spawned).toBe(0)
  expect(t.status).toBe('done')
  expect(t.attempts).toBe(1)
  expect(t.runs!.at(-1)!.ended_note).toBe('merged')
})

test('a try that finds no change while its own earlier work is already on main is done, not failed', async () => {
  const w = world({ dirty: false, head: H1, changed: [], answer: (args) => (args[0] === 'log' && args.at(-1) === H1 ? ok(t1Commit(1)) : undefined) })
  const [b, t] = boardWith('auto', [], { attempts: 2 })
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r.ok).toBe(true)
  expect(r.merged).toBe(H1)
  expect(r.detail).toMatch(/^already merged into main/)
  expect(finishedNote(r)).toBe('merged')
  // a commit that isn't this task's is still "no change"
  const w2 = world({ dirty: false, head: H1, changed: [] })
  expect((await checkAndMerge(w2.$, t, WT, b)).detail).toBe('the worker made no change')
})

test("a late report from a worker this copy lost in a reload is still taken when its task is doing for it", async () => {
  S.me = 'me'
  const w = world()
  const [b] = boardWith('auto', [], { session: 'me', agent: 'ag9', history: [] })
  await saveBoard(w.$, b)
  expect(await lateHandBack(w.$, 'ag9')).toBe(true)
  expect(workers.get('ag9')?.task).toBe('T-1')
  workers.delete('ag9')
  expect(await lateHandBack(w.$, 'someone-else')).toBe(false)
})

// ---------------- a try whose work merged must end done, never timed out (T-237) ----------------

/** The fake git answers for a branch symcc/T-1 whose tip H1 is T-1's try-1 commit, on main when `merged`. */
const t1Merged = (merged = true) => (args: string[]) => {
  if (args.join(' ') === 'rev-parse -q --verify refs/heads/symcc/T-1') return ok(H1)
  if (args[0] === 'log' && args.at(-1) === H1) return ok(t1Commit(1))
  if (args[0] === 'merge-base' && args[1] === '--is-ancestor' && args[2] === H1) return merged ? ok() : fail()
  return undefined
}
/** Makes the agent list show the handed-back worker ag1 as still there, only idle (not ended). */
const idleAgent = (w: ReturnType<typeof world>) => void (w.$.agents.list = async () => [{ id: 'ag1', kind: 'worker', status: 'waiting', description: 'T-1' }])

test('T-228: a try that merged but was left "doing" (its copy of the plugin stopped before writing done) ends done; max_minutes never stops it and nothing starts again', async () => {
  S.me = 'me'
  for (const mark of ['stale', 'none'] as const) {
    for (const via of ['check', 'reload'] as const) {
      const w = world({ answer: t1Merged() })
      idleAgent(w)
      const sent: string[] = []
      let spawned = 0
      const a = w.$
      a.agents.spawn = async () => (spawned++, { agentId: 'ag2' })
      a.agents.send = a.agents.stop = async (_to, text) => void sent.push(text)
      // started long ago (far over max_minutes), handed back, merged and recorded; but never marked done
      const [b] = boardWith('auto', ['npm test'], { session: 'me', agent: 'ag1', branch: 'symcc/T-1', history: ['created by the lead'], merged: H1, runs: [{ started: ISO, ended: ISO, commits: [H1] }], ...(mark === 'stale' ? { finishing: new Date(Date.now() - 10 * 60_000).toISOString() } : {}) })
      await saveBoard(w.$, b)
      S.driving = true
      if (via === 'reload') {
        w.put(LEAD, leadText('me', Date.now()))
        await claimLead(w.$, true)
      }
      await check(w.$)
      await check(w.$)
      S.driving = false
      const t = find(await load(w.$), 'T-1')!
      expect(workers.has('ag1')).toBe(false)
      expect(t.status).toBe('done')
      expect(t.merged).toBe(H1)
      expect(t.attempts).toBe(1)
      expect(t.history.join('\n')).not.toMatch(/over the limit/)
      expect(t.runs!.at(-1)!.ended_by).toBe('finished')
      expect(t.runs!.at(-1)!.ended_note).toBe('merged')
      expect(spawned).toBe(0)
      // the idle worker is never stopped for running too long (once done, it is only let go as a leftover)
      expect(sent.some(m => /ran longer than/.test(m))).toBe(false)
    }
  }
})

test('T-237: a worker hands back, the merge takes a while and the clock passes max_minutes (a reload meanwhile): the regular check does not stop it, and it ends done', async () => {
  S.me = 'me'
  const sent: string[] = []
  const r = await tryEnds(async w => {
    idleAgent(w)
    ;w.$.agents.send = w.$.agents.stop = async (_to, text) => void sent.push(text)
    let once = false
    w.onRun(async cmd => {
      if (once || !/^\/bin\/sh -c /.test(cmd)) return
      once = true
      // while the tests run: the plugin reloads (this copy forgets what it is checking), and the
      // regular check runs, long after the try started (its run started on ISO, days ago)
      forget()
      S.driving = true
      w.put(LEAD, leadText('me', Date.now()))
      await claimLead(w.$, true)
      await check(w.$)
      expect(workers.has('ag1')).toBe(false)
      expect(find(await load(w.$), 'T-1')!.status).toBe('doing')
    })
    await workerFinished(w.$, 'ag1', 'made the change')
    // after the merge, the regular check again: still nothing stops it
    await check(w.$)
    S.driving = false
  }, { extra: { session: 'me', agent: 'ag1', branch: 'symcc/T-1' } })
  expect(r.t.status).toBe('done')
  expect(r.t.merged).toBe(H1)
  expect(r.end).toEqual(['finished', 'merged'])
  expect(r.t.history.join('\n')).not.toMatch(/over the limit|too late|restarted/)
  expect(r.t.attempts).toBe(1)
  expect(sent.some(m => /ran longer than/.test(m))).toBe(false)
})

test('T-237: a task changed while its work is being merged (sent back or asked meanwhile) still ends done, with its merged commit', async () => {
  for (const to of ['todo', 'waiting'] as const) {
    const r = await tryEnds(async w => {
      let once = false
      w.onRun(async cmd => {
        if (once || !/ git update-ref .*refs\/heads\/main/.test(cmd)) return
        once = true
        // right as main moves: the owner's Allow (or the lead's change) writes the task
        await change(w.$, x => patchTask(x, 'T-1', { status: to, files: ['src/', 'tests/'], history: [...find(x, 'T-1')!.history, 'files widened: + tests/'] }, ISO))
      })
      await workerFinished(w.$, 'ag1', 'made the change')
    })
    expect(r.t.status).toBe('done')
    expect(r.t.merged).toBe(H1)
    expect(r.end).toEqual(['finished', 'merged'])
    expect(r.t.history.at(-1)).toMatch(/the work was already merged, so it stays done$/)
  }
})

test('T-237: a merge whose done could not be written (settle failed) is still marked done', async () => {
  const r = await tryEnds(async w => {
    // the first save of the board with T-1 done (settle's write) fails once
    const save = w.$
    const run = save.run
    let failed = false
    save.run = async (argv, o) => {
      if (!failed && argv[0] === 'mv' && argv.at(-1) === BOARD && find(JSON.parse(w.files.get(argv.at(-2)!) ?? '{"tasks":[]}') as Board, 'T-1')?.status === 'done') {
        failed = true
        return fail('disk full')
      }
      return run(argv, o)
    }
    await workerFinished(w.$, 'ag1', 'made the change')
    expect(failed).toBe(true)
  })
  expect(r.t.status).toBe('done')
  expect(r.t.merged).toBe(H1)
})

test('T-237: retrying a task whose last try is already on its branch marks it done instead of starting a worker', async () => {
  S.me = 'me'
  const w = world({ answer: t1Merged() })
  let spawned = 0
  ;w.$.agents.spawn = async () => (spawned++, { agentId: 'ag2' })
  // failed by the timeout although its try had merged (as T-228 was); no merge recorded on the board
  const [b] = boardWith('auto', [], { status: 'failed', note: 'stopped: ran over 45 min', branch: 'symcc/T-1', history: ['created by the lead', 'try 1: stopped after 47 min (over the limit)'], runs: [{ started: ISO, ended: ISO, ended_by: 'timed out', ended_note: 'ran over 45 min' }] })
  await saveBoard(w.$, b)
  await runTool(w.$, 'retry', { task: 'T-1' })
  await startWorker(w.$, 'T-1')
  const t = find(await load(w.$), 'T-1')!
  expect(spawned).toBe(0)
  expect(t.status).toBe('done')
  expect(t.merged).toBe(H1)
  expect(t.attempts).toBe(1)
  expect(leadQueue.some(x => x.includes('T-1') && x.includes('no new try starts'))).toBe(true)
})

// ---------------- a checking and merging step that never ends (T-219) ----------------

/**
 * A world where T-1's worker has just finished and its first test command hangs until `free()`
 * is called. The finishLimitMs(1) timer is caught (`limit`), never fired by itself; other timers never fire.
 */
function stuckFinish(g: Partial<Git> = {}) {
  const w = world(g)
  let free = () => {}
  const gate = new Promise<void>(r => (free = r))
  let hung = false
  w.onRun(async cmd => {
    if (hung || !/^\/bin\/sh -c /.test(cmd)) return
    hung = true
    await gate
  })
  const limit: { fire?: () => void; ms?: number; cancelled: boolean } = { cancelled: false }
  ;(w.$ as unknown as { clock: { after: unknown } }).clock.after = (ms: number, f: () => void) => {
    if (ms !== finishLimitMs(1)) return { cancel() {} }
    limit.fire = f
    limit.ms = ms
    return { cancel: () => void (limit.cancelled = true) }
  }
  return { w, free, limit, hungNow: () => hung }
}

/** Promise turns only (no clock), until `done()` and the board lock is free. */
async function turns(w: ReturnType<typeof world>, done: () => boolean) {
  for (let i = 0; i < 20000 && !(done() && !w.files.has(LOCK)); i++) await (queuedStarts() ? drainStarts(w.$) : Promise.resolve())
  expect(done()).toBe(true)
}

test('a checking and merging step that never ends is sent back to todo after the limit; the lead is told once; its late end writes nothing', async () => {
  S.me = 'me'
  const { w, free, limit, hungNow } = stuckFinish()
  const [b] = boardWith('auto', ['npm test'], { session: 'me', branch: 'symcc/T-1', history: ['created by the lead'], runs: [{ started: ISO }] })
  await saveBoard(w.$, b)
  w.put(`${WT}/.git`, 'gitdir: x')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  let ended = false
  void workerFinished(w.$, 'ag1', 'made the change').then(() => (ended = true))
  await turns(w, hungNow)
  // still within the limit: it stays "doing", being checked
  expect(find(await load(w.$), 'T-1')!.status).toBe('doing')
  expect(finishingSet.has('T-1')).toBe(true)
  expect(ended).toBe(false)
  expect(limit.ms).toBe(finishLimitMs(1))
  expect(finishLimitMs(1)).toBeGreaterThan(600_000)
  limit.fire!()
  await turns(w, () => ended)
  let t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('todo')
  expect(t.finishing).toBeUndefined()
  expect(t.checking).toBeUndefined()
  expect(t.session).toBeUndefined()
  expect(t.history.at(-1)).toBe('try 1: restarted: its checking and merging ran over 15 min and was stopped')
  expect(t.runs!.at(-1)!.ended_by).toBe('restarted')
  expect(finishingSet.has('T-1')).toBe(false)
  const told = leadQueue.filter(x => x.includes('T-1') && x.includes('ran over 15 minutes'))
  expect(told.length).toBe(1)
  expect(told[0]).toContain('sent it back to todo for a fresh try')
  // its folder is kept
  expect(w.calls.some(c => c.includes('worktree remove'))).toBe(false)
  // the old step wakes up late, its tests passing: it merges nothing and writes nothing over the task
  const before = JSON.stringify(t)
  const queued = leadQueue.length
  free()
  for (let i = 0; i < 5000; i++) await Promise.resolve()
  await turns(w, () => true)
  t = find(await load(w.$), 'T-1')!
  expect(JSON.stringify(t)).toBe(before)
  expect(w.calls.some(c => / git update-ref .*refs\/heads\/main/.test(c))).toBe(false)
  expect(leadQueue.length).toBe(queued)
})

test('a step given up after the limit whose work already reached main is done, not sent back', async () => {
  S.me = 'me'
  const { w, free, limit, hungNow } = stuckFinish({ answer: (args) => {
    if (args.join(' ') === 'rev-parse -q --verify refs/heads/symcc/T-1') return ok(H1)
    if (args[0] === 'log' && args.at(-1) === H1) return ok(t1Commit(1))
    if (args[0] === 'merge-base' && args[1] === '--is-ancestor' && args[2] === H1) return ok()
    return undefined
  } })
  const [b] = boardWith('auto', ['npm test'], { session: 'me', branch: 'symcc/T-1', history: [], runs: [{ started: ISO }] })
  await saveBoard(w.$, b)
  w.put(`${WT}/.git`, 'gitdir: x')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  let ended = false
  void workerFinished(w.$, 'ag1', 'made the change').then(() => (ended = true))
  await turns(w, hungNow)
  limit.fire!()
  await turns(w, () => ended)
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.merged).toBe(H1)
  expect(leadQueue.filter(x => x.includes('T-1') && x.includes('already merged')).length).toBe(1)
  free()
  for (let i = 0; i < 5000; i++) await Promise.resolve()
  expect(find(await load(w.$), 'T-1')!.status).toBe('done')
})

test('a stuck merge step given up lets the next merge into the same branch go on', async () => {
  let release = () => {}
  const gone = new Promise<void>(r => (release = r))
  const order: string[] = []
  void mergeTurn('main', () => new Promise<void>(() => {}), gone)
  const next = mergeTurn('main', async () => void order.push('next'))
  for (let i = 0; i < 50; i++) await Promise.resolve()
  expect(order).toEqual([])
  release()
  await next
  expect(order).toEqual(['next'])
})

test('a normal checking and merging step is untouched by the limit: merged, done, and the limit timer cancelled', async () => {
  S.me = 'me'
  const { w, free, limit } = stuckFinish()
  free()
  const [b] = boardWith('auto', ['npm test'], { session: 'me', branch: 'symcc/T-1', history: [], runs: [{ started: ISO }] })
  await saveBoard(w.$, b)
  w.put(`${WT}/.git`, 'gitdir: x')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  await workerFinished(w.$, 'ag1', 'made the change')
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(limit.cancelled).toBe(true)
  expect(leadQueue.some(x => x.includes('ran over'))).toBe(false)
  // the timer firing after the end changes nothing
  limit.fire!()
  for (let i = 0; i < 200; i++) await Promise.resolve()
  expect(find(await load(w.$), 'T-1')!.status).toBe('done')
})

// ---------------- an approve that never ends, and a given-up step still waiting for its merge turn (T-222) ----------------

test('a stuck approve is given up after the limit: it stays in review with a note, the lead is told once, approving again merges; its late end changes nothing', async () => {
  // main moved since review, so the approve runs the tests again; the first test command hangs until free()
  const w = await inReview({ upToDate: false })
  let free = () => {}
  const gate = new Promise<void>(r => (free = r))
  let hung = false
  w.onRun(async cmd => {
    if (hung || !/^\/bin\/sh -c /.test(cmd)) return
    hung = true
    await gate
  })
  const limits: (() => void)[] = []
  ;(w.$ as unknown as { clock: { after: unknown } }).clock.after = (ms: number, f: () => void) => {
    if (ms === finishLimitMs(1)) limits.push(f)
    return { cancel() {} }
  }
  let out: string | undefined
  void runTool(w.$, 'approve', { task: 'T-1' }).then(x => (out = String(x)))
  await turns(w, () => hung)
  expect(find(await load(w.$), 'T-1')!.note).toBe('approved; checking and merging')
  // the list row says which step the approve is in
  expect(statusCell(find(await load(w.$), 'T-1')!, Date.now())).toBe('test')
  expect(await runTool(w.$, 'approve', { task: 'T-1' })).toBe('T-1 is already being merged')
  expect(limits.length).toBe(1)
  limits[0]!()
  await turns(w, () => out !== undefined)
  expect(out).toBe('T-1 was not merged and stays in review: its checking and merging ran over 15 minutes and was given up. Approve it again.')
  let t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('review')
  expect(t.checking).toBeUndefined()
  expect(statusCell(t, Date.now())).toBe('review')
  expect(t.note).toBe('approved, but the merge ran over 15 min and was given up; approve it again')
  expect(t.history.at(-1)).toBe('try 1: approved by the owner → its checking and merging ran over 15 min and was given up; nothing written, it stays in review')
  expect(leadQueue.filter(x => x.includes('T-1') && x.includes('ran over 15 minutes')).length).toBe(1)
  expect(w.git.main).toBe(M1)
  // approving again works, and its merge into main goes on while the old one still hangs
  const again = await runTool(w.$, 'approve', { task: 'T-1' })
  expect(again).toBe(`T-1 approved and merged: merged into main (${H2.slice(0, 8)}); approved by the owner`)
  expect(w.git.main).toBe(H2)
  t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  // the old approve wakes up late, its tests passing: it merges nothing and writes nothing
  const before = JSON.stringify(t)
  const queued = leadQueue.length
  const moves = w.calls.filter(c => c.includes('git update-ref')).length
  free()
  for (let i = 0; i < 5000; i++) await Promise.resolve()
  await turns(w, () => true)
  expect(JSON.stringify(find(await load(w.$), 'T-1')!)).toBe(before)
  expect(w.calls.filter(c => c.includes('git update-ref')).length).toBe(moves)
  expect(leadQueue.length).toBe(queued)
})

test('a finish step given up while it waits for its merge turn runs no git command and no test in its folder when its turn comes', async () => {
  S.me = 'me'
  const { w, limit } = stuckFinish()
  const [b] = boardWith('auto', ['npm test'], { session: 'me', branch: 'symcc/T-1', history: [], runs: [{ started: ISO }] })
  await saveBoard(w.$, b)
  w.put(`${WT}/.git`, 'gitdir: x')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  // an earlier merge into main holds the turn until let go
  let letGo = () => {}
  const earlier = mergeTurn('main', () => new Promise<void>(r => (letGo = r)))
  let ended = false
  void workerFinished(w.$, 'ag1', 'made the change').then(() => (ended = true))
  await turns(w, () => w.calls.some(c => c.includes('git diff --name-only')))
  for (let i = 0; i < 200; i++) await Promise.resolve()
  // queued behind the earlier merge: no test has run
  expect(w.calls.some(c => c.startsWith('/bin/sh'))).toBe(false)
  limit.fire!()
  await turns(w, () => ended)
  expect(find(await load(w.$), 'T-1')!.status).toBe('todo')
  const seen = w.calls.length
  letGo()
  await earlier
  for (let i = 0; i < 5000; i++) await Promise.resolve()
  const late = w.calls.slice(seen)
  expect(late.filter(c => c.startsWith('wt:') || c.startsWith('/bin/sh'))).toEqual([])
  expect(late.some(c => c.includes('git update-ref'))).toBe(false)
  expect(find(await load(w.$), 'T-1')!.status).toBe('todo')
})

// ---------------- finished work waiting only for the owner's files (T-223) ----------------

/**
 * T-1's worker (ag1) finishes in auto mode while the owner has main checked out with `status` (their
 * `git status --porcelain -z`). This session drives the board; every worker start is kept in `spawned`.
 */
async function finishedOnDirtyMain(status: string, test_commands = ['npm test']) {
  const w = world({ current: 'main', status })
  S.me = 'me'
  const spawned: string[] = []
  const x = w.$
  x.agents.spawn = async e => (spawned.push(String(e.name)), { agentId: `ag${spawned.length + 1}` })
  x.plugin = { name: 'symcc', root: '/plugin' }
  x.fs.list = async () => []
  const [b0] = boardWith('auto', test_commands, { session: 'me', agent: 'ag1', branch: 'symcc/T-1', history: ['created by the lead'], runs: [{ started: ISO }] })
  await saveBoard(w.$, b0)
  w.put(`${WT}/.git`, 'gitdir: x')
  workers.clear()
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  S.startupDone = true
  S.driving = true
  leadQueue.splice(0)
  await workerFinished(w.$, 'ag1', 'made the change')
  return { w, spawned, t: async () => find(await load(w.$), 'T-1')! as BoardTask }
}

const toldWaiting = () => leadQueue.filter(m => m.includes("waits for the owner's files")).length

test("an unrelated uncommitted change on main doesn't block a finished task: it merges and the change is still there", async () => {
  try {
    const { w, spawned, t } = await finishedOnDirtyMain(' M README.md\0')
    expect((await t()).status).toBe('done')
    expect(w.git.main).toBe(H1)
    expect(w.calls).toContain(`root: git read-tree -m -u ${M1} ${H1}`)
    expect(w.git.status).toBe(' M README.md\0')
    expect(w.calls.some(c => /^root: git (reset|checkout|stash|restore|clean) /.test(c))).toBe(false)
    expect(spawned).toEqual([])
  } finally {
    cleanUp()
  }
})

test('an uncommitted change in a file the task changes: the task waits with a note, the lead is told once, no worker starts; the next check merges it once the file is clear', async () => {
  try {
    const { w, spawned, t } = await finishedOnDirtyMain(' M src/a.ts\0 M README.md\0')
    let x = await t()
    expect(x.status).toBe('waiting')
    expect(x.note).toBe('waiting for your files on main: src/a.ts; commit or stash them')
    expect(x.merge_wait).toEqual({ dirty: ['src/a.ts'], untracked: [], ignored: [] })
    expect(x.question).toBeNull()
    expect(x.runs!.at(-1)!.ended_note).toBe('waiting for your files')
    expect(w.git.main).toBe(M1)
    expect(ranTests(w)).toEqual(['/bin/sh -c npm test'])
    expect(toldWaiting()).toBe(1)
    // the regular check while the file is still changed: nothing merges, nothing is told again, no worker
    await check(w.$)
    x = await t()
    expect(x.status).toBe('waiting')
    expect(w.git.main).toBe(M1)
    expect(toldWaiting()).toBe(1)
    expect(spawned).toEqual([])
    // the owner reverts src/a.ts (README.md stays changed): the next check only merges, with no worker and no new test run (main did not move)
    w.git.status = ' M README.md\0'
    await check(w.$)
    x = await t()
    expect(x.status).toBe('done')
    expect(x.merged).toBe(H1)
    expect(x.merge_wait).toBeUndefined()
    expect(x.runs!.at(-1)!.ended_note).toBe('merged')
    expect(w.git.main).toBe(H1)
    expect(ranTests(w)).toEqual(['/bin/sh -c npm test'])
    expect(spawned).toEqual([])
    expect(x.attempts).toBe(1)
    expect(leadQueue.some(m => m.startsWith('✓ T-1 "Do it" merged into main'))).toBe(true)
    expect(w.git.status).toBe(' M README.md\0')
  } finally {
    cleanUp()
  }
})

test('a waiting merge whose main moved meanwhile is brought up to date and tested again, still with no worker', async () => {
  try {
    const { w, spawned, t } = await finishedOnDirtyMain(' M src/a.ts\0')
    expect((await t()).status).toBe('waiting')
    // the owner committed their change to src/a.ts: main moved
    w.git.status = ''
    w.git.main = M2
    w.git.upToDate = false
    await check(w.$)
    const x = await t()
    expect(x.status).toBe('done')
    expect(w.git.main).toBe(H2)
    expect(ranTests(w)).toEqual(['/bin/sh -c npm test', '/bin/sh -c npm test'])
    expect(spawned).toEqual([])
  } finally {
    cleanUp()
  }
})

test('a waiting merge that now conflicts with a moved main gets a new try with a worker, as before', async () => {
  try {
    const { w, t } = await finishedOnDirtyMain(' M src/a.ts\0')
    w.git.status = ''
    w.git.main = M2
    w.git.upToDate = false
    w.git.conflict = true
    expect(await runTool(w.$, 'retry', { task: 'T-1' })).toBe('T-1 not merged: conflicts with the latest main (see the board for what happens next)')
    const x = await t()
    expect(x.status === 'todo' || x.status === 'doing').toBe(true)
    expect(x.merge_main).toBe(true)
    expect(x.merge_wait).toBeUndefined()
  } finally {
    cleanUp()
  }
})

test('a manual retry of a task waiting for the owner\'s files only merges it; while they are still in the way it keeps waiting', async () => {
  try {
    const { w, spawned, t } = await finishedOnDirtyMain('?? src/a.ts\0')
    expect((await t()).note).toBe('waiting for your files on main: src/a.ts; move, rename or commit them')
    expect(await runTool(w.$, 'retry', { task: 'T-1' })).toBe('T-1 was not merged and keeps waiting: you have untracked files on main that T-1 would overwrite (src/a.ts); move, rename or commit them, and T-1 merges on its own at the next check.')
    expect((await t()).status).toBe('waiting')
    expect(toldWaiting()).toBe(1)
    w.git.status = ''
    expect(await runTool(w.$, 'retry', { task: 'T-1' })).toBe(`T-1 merged: merged into main (${H1.slice(0, 8)})`)
    const x = await t()
    expect(x.status).toBe('done')
    expect(x.attempts).toBe(1)
    expect(spawned).toEqual([])
    expect(ranTests(w)).toEqual(['/bin/sh -c npm test'])
  } finally {
    cleanUp()
  }
})

test('an approve blocked by the owner\'s files is merged by the regular check once they are clear, and a retry of it only merges too', async () => {
  try {
    for (const how of ['check', 'retry'] as const) {
      const w = await inReview({ current: 'main', status: ' M src/a.ts\0' })
      S.me = 'me'
      const x = w.$ as unknown as { fs: Record<string, unknown> }
      x.fs.list = async () => []
      S.startupDone = true
      S.driving = true
      await runTool(w.$, 'approve', { task: 'T-1' })
      expect(find(await load(w.$), 'T-1')!.status).toBe('review')
      w.git.status = ''
      if (how === 'check') await check(w.$)
      else expect(await runTool(w.$, 'retry', { task: 'T-1' })).toBe(`T-1 approved and merged: merged into main (${H1.slice(0, 8)}); approved by the owner`)
      const t = find(await load(w.$), 'T-1')!
      expect(t.status).toBe('done')
      expect(w.git.main).toBe(H1)
    }
  } finally {
    cleanUp()
  }
})

test('merge_wait is kept only while the task stays waiting or in review', () => {
  const [b] = boardWith('auto')
  const mw = { dirty: [], untracked: [], ignored: ['a.txt'] }
  const w = patchTask(b, 'T-1', { status: 'waiting', merge_wait: mw, note: 'waiting for your files' } as Partial<BoardTask>, ISO)
  expect((find(w, 'T-1') as BoardTask).merge_wait).toEqual(mw)
  expect((find(patchTask(w, 'T-1', { note: 'x' }, ISO), 'T-1') as BoardTask).merge_wait).toEqual(mw)
  expect((find(patchTask(w, 'T-1', { status: 'todo' }, ISO), 'T-1') as BoardTask).merge_wait).toBeUndefined()
  expect((find(parseBoard(JSON.stringify(w)), 'T-1') as BoardTask).merge_wait).toEqual(mw)
  const done = { ...w, tasks: w.tasks.map(t => ({ ...t, status: 'done' as const })) }
  expect((find(parseBoard(JSON.stringify(done)), 'T-1') as BoardTask).merge_wait).toBeUndefined()
  const bad = { ...w, tasks: w.tasks.map(t => ({ ...t, merge_wait: { dirty: [1] } })) }
  expect((find(parseBoard(JSON.stringify(bad)), 'T-1') as BoardTask).merge_wait).toBeUndefined()
})

test("a merge waiting for the owner's files that runs over keeps waiting for them: it merges on its own once they are clear, and a retry only merges", async () => {
  try {
    const { w, spawned, t } = await finishedOnDirtyMain(' M src/a.ts\0')
    expect((await t()).status).toBe('waiting')
    // the owner commits their change (main moves), so the merge tests again; that test hangs until free()
    w.git.status = ''
    w.git.main = M2
    w.git.upToDate = false
    let free = () => {}
    const gate = new Promise<void>(r => (free = r))
    let hung = false
    w.onRun(async cmd => {
      if (hung || !/^\/bin\/sh -c /.test(cmd)) return
      hung = true
      await gate
    })
    const limits: (() => void)[] = []
    ;(w.$ as unknown as { clock: { after: unknown } }).clock.after = (ms: number, f: () => void) => {
      if (ms === finishLimitMs(1)) limits.push(f)
      return { cancel() {} }
    }
    let out: string | undefined
    void runTool(w.$, 'retry', { task: 'T-1' }).then(x => (out = String(x)))
    await turns(w, () => hung)
    expect(limits.length).toBe(1)
    limits[0]!()
    await turns(w, () => out !== undefined)
    expect(out).toBe('T-1 was not merged and keeps waiting: its checking and merging ran over 15 minutes and was given up. Retry it.')
    let x = await t()
    expect(x.status).toBe('waiting')
    expect(x.question).toBeNull()
    expect(x.merge_wait).toEqual({ dirty: ['src/a.ts'], untracked: [], ignored: [] })
    expect(x.note).toBe('the merge ran over 15 min and was given up; symcc retry T-1')
    expect(x.history.at(-1)).toBe('try 1: merging once your files were out of the way → its checking and merging ran over 15 min and was given up; nothing written, it stays waiting')
    expect(leadQueue.filter(m => m.includes('T-1') && m.includes('ran over 15 minutes')).length).toBe(1)
    expect(leadQueue.some(m => m.includes('ran over 15 minutes') && m.includes('merges on its own'))).toBe(true)
    expect(w.git.main).toBe(M2)
    // the owner changed src/a.ts again: a retry only tries the merge (no worker) and it keeps waiting
    w.git.status = ' M src/a.ts\0'
    expect(await runTool(w.$, 'retry', { task: 'T-1' })).toContain('T-1 was not merged and keeps waiting: you have uncommitted changes on main')
    expect((await t()).status).toBe('waiting')
    await check(w.$)
    expect((await t()).status).toBe('waiting')
    expect(spawned).toEqual([])
    // once the file is clear, the regular check merges it on its own, with no worker
    w.git.status = ''
    await check(w.$)
    x = await t()
    expect(x.status).toBe('done')
    expect(x.merge_wait).toBeUndefined()
    expect(x.attempts).toBe(1)
    expect(spawned).toEqual([])
    free()
    for (let i = 0; i < 5000; i++) await Promise.resolve()
  } finally {
    cleanUp()
  }
})

test("a merge waiting for the owner's files that runs over twice in a row is failed, not started again on its own; one give-up is retried", async () => {
  try {
    const { w, spawned, t } = await finishedOnDirtyMain(' M src/a.ts\0')
    expect((await t()).status).toBe('waiting')
    // the files are clear and main moved, so each merge tests again; every test hangs
    w.git.status = ''
    w.git.main = M2
    w.git.upToDate = false
    let hangs = 0
    w.onRun(async cmd => {
      if (!/^\/bin\/sh -c /.test(cmd)) return
      hangs++
      await new Promise<void>(() => {})
    })
    const limits: (() => void)[] = []
    ;(w.$ as unknown as { clock: { after: unknown } }).clock.after = (ms: number, f: () => void) => {
      if (ms === finishLimitMs(1)) limits.push(f)
      return { cancel() {} }
    }
    // the regular check merges it on its own; that merge runs over and is given up once
    void check(w.$)
    await turns(w, () => hangs === 1)
    expect(limits.length).toBe(1)
    limits[0]!()
    await turns(w, () => leadQueue.some(m => m.includes('T-1') && m.includes('ran over 15 minutes')))
    let x = await t()
    expect(x.status).toBe('waiting')
    expect(x.merge_wait).toEqual({ dirty: ['src/a.ts'], untracked: [], ignored: [] })
    // one give-up: the next regular check still tries the merge again on its own
    void check(w.$)
    await turns(w, () => hangs === 2)
    expect(limits.length).toBe(2)
    limits[1]!()
    await turns(w, () => leadQueue.some(m => m.includes('T-1') && m.includes('twice in a row')))
    x = await t()
    expect(x.status).toBe('failed')
    expect(x.merge_wait).toBeUndefined()
    expect(x.note).toBe('its merge ran over 15 min twice in a row and was given up both times; nothing was merged')
    expect(x.history.at(-1)).toBe('try 1: merging once your files were out of the way → its merge ran over 15 min twice in a row and was given up both times; nothing was merged')
    expect(leadQueue.filter(m => m.includes('T-1') && m.includes('twice in a row')).length).toBe(1)
    expect(leadQueue.filter(m => m.includes('T-1') && m.includes('ran over 15 minutes')).length).toBe(2)
    // a third regular check starts nothing: no merge, no worker, the lead is not told again
    await check(w.$)
    for (let i = 0; i < 2000; i++) await Promise.resolve()
    expect(hangs).toBe(2)
    expect(limits.length).toBe(2)
    expect((await t()).status).toBe('failed')
    expect(leadQueue.filter(m => m.includes('T-1') && m.includes('ran over 15 minutes')).length).toBe(2)
    expect(spawned).toEqual([])
  } finally {
    cleanUp()
  }
})

// ---------------- the limit grows with the test commands, two give-ups in a row fail, work that landed late (T-224) ----------------

/** Catches the timers the step asks for of at least a minute (the merge time limit); the short ones (the lead's) never fire. */
function catchLimits(w: ReturnType<typeof world>) {
  const timers: { ms: number; f: () => void; off: boolean }[] = []
  ;(w.$ as unknown as { clock: { after: unknown } }).clock.after = (ms: number, f: () => void) => {
    if (ms < 60_000) return { cancel() {} }
    const x = { ms, f, off: false }
    timers.push(x)
    return { cancel: () => void (x.off = true) }
  }
  return timers
}

/** T-1 "doing" in auto mode with `test_commands`, its worker ag1 just about to finish. */
async function aboutToFinish(w: ReturnType<typeof world>, test_commands = ['npm test']) {
  const [b] = boardWith('auto', test_commands, { session: 'me', agent: 'ag1', branch: 'symcc/T-1', history: ['created by the lead'], runs: [{ started: ISO }] })
  await saveBoard(w.$, b)
  w.put(`${WT}/.git`, 'gitdir: x')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
}

test('the merge time limit grows with the test commands: three get more time than one', () => {
  expect(finishLimitMs(3)).toBeGreaterThan(finishLimitMs(1))
  expect(finishLimitMs(3)).toBeGreaterThan(3 * TEST_TIMEOUT_MS)
  expect(finishLimitMs(1)).toBeGreaterThan(TEST_TIMEOUT_MS)
  expect(finishLimitMs(0)).toBe(finishLimitMs(1))
})

test('a finish step with three slow but finishing test commands (8 min each) is not given up: it merges under its limit', async () => {
  S.me = 'me'
  const w = world()
  const timers = catchLimits(w)
  // a fake clock: each test command takes 8 minutes; the limit fires once its time has come
  let spent = 0
  w.onRun(async cmd => {
    if (!cmd.startsWith('/bin/sh -c ')) return
    spent += 8 * 60_000
    for (const x of timers) if (!x.off && x.ms <= spent) (x.off = true), x.f()
  })
  await aboutToFinish(w, ['npm test', 'npm run lint', 'npm run e2e'])
  await workerFinished(w.$, 'ag1', 'made the change')
  // 24 minutes in all: over the one-command limit, within the three-command one
  expect(spent).toBeGreaterThan(finishLimitMs(1))
  expect(timers.map(x => x.ms)).toEqual([finishLimitMs(3)])
  const t = find(await load(w.$), 'T-1')!
  expect(ranTests(w).length).toBe(3)
  expect(t.status).toBe('done')
  expect(t.merged).toBe(H1)
  expect(w.git.main).toBe(H1)
  expect(leadQueue.some(x => x.includes('ran over'))).toBe(false)
})

test('a task whose checking and merging is given up twice in a row ends failed with a note; no third worker starts; the lead is told', async () => {
  try {
    const w = world()
    S.me = 'me'
    const spawned: string[] = []
    const x = w.$
    x.agents.spawn = async e => (spawned.push(String(e.name)), { agentId: `ag${spawned.length + 1}` })
    x.plugin = { name: 'symcc', root: '/plugin' }
    x.fs.list = async () => []
    const timers = catchLimits(w)
    // every test command hangs: each try's checking and merging is stuck
    let hung = 0
    w.onRun(async cmd => {
      if (!cmd.startsWith('/bin/sh -c ')) return
      hung++
      await new Promise<void>(() => {})
    })
    await aboutToFinish(w)
    S.startupDone = true
    S.driving = true
    // try 1: given up, back to todo, and a second worker starts by itself
    let ended = false
    void workerFinished(w.$, 'ag1', 'made the change').then(() => (ended = true))
    await turns(w, () => hung === 1 && timers.length === 1)
    timers[0]!.f()
    await turns(w, () => ended && spawned.length === 1)
    for (let i = 0; i < 500; i++) await Promise.resolve()
    let t = find(await load(w.$), 'T-1')!
    expect(t.status).toBe('doing')
    expect(t.attempts).toBe(2)
    expect(workers.get('ag2')?.task).toBe('T-1')
    // try 2: given up again, so it fails instead of looping
    ended = false
    void workerFinished(w.$, 'ag2', 'made the change again').then(() => (ended = true))
    await turns(w, () => hung === 2 && timers.length === 2)
    timers[1]!.f()
    await turns(w, () => ended)
    t = find(await load(w.$), 'T-1')!
    expect(t.status).toBe('failed')
    expect(t.note).toBe('its checking and merging ran over 15 min twice in a row and was given up both times; nothing was merged')
    expect(t.history.at(-1)).toBe(`try 2: ${t.note}`)
    expect(t.session).toBeUndefined()
    expect(t.finishing).toBeUndefined()
    expect(t.runs!.at(-1)!.ended_by).toBe('stopped')
    const told = leadQueue.filter(m => m.startsWith('✗ T-1') && m.includes('twice in a row'))
    expect(told.length).toBe(1)
    expect(told[0]).toContain('no new try starts')
    // no third worker, not even at the regular check
    await check(w.$)
    for (let i = 0; i < 500; i++) await Promise.resolve()
    expect(spawned.length).toBe(1)
    expect(find(await load(w.$), 'T-1')!.status).toBe('failed')
    expect(w.git.main).toBe(M1)
  } finally {
    cleanUp()
  }
})

/** Makes the move of main (git update-ref) fire the merge time limit and then hang until `free()`: the step is given up while main moves. */
function hangOnMove(w: ReturnType<typeof world>) {
  const timers = catchLimits(w)
  let free = () => {}
  const gate = new Promise<void>(r => (free = r))
  let moving = false
  w.onRun(async cmd => {
    if (moving || !/ git update-ref .*refs\/heads\/main/.test(cmd)) return
    moving = true
    for (const x of timers) if (!x.off) (x.off = true), x.f()
    await gate
  })
  return { free, moving: () => moving }
}

test('an approve given up while it moves main, which then lands, ends with the task done and its commits recorded; the lead is told once', async () => {
  const w = await inReview({ upToDate: false }, {}, ['npm test'], { history: [], runs: [{ started: ISO, ended: ISO, ended_by: 'finished', ended_note: 'ready for review' }] })
  const { free, moving } = hangOnMove(w)
  let out: string | undefined
  void runTool(w.$, 'approve', { task: 'T-1' }).then(x => (out = String(x)))
  await turns(w, () => out !== undefined)
  expect(moving()).toBe(true)
  expect(out).toContain('was not merged and stays in review')
  expect(find(await load(w.$), 'T-1')!.status).toBe('review')
  // the move ends late: main is at the task's work
  free()
  await turns(w, () => find(w.files.has(BOARD) ? parseBoard(w.files.get(BOARD)!) : emptyBoard(), 'T-1')?.status === 'done')
  for (let i = 0; i < 500; i++) await Promise.resolve()
  const t = find(await load(w.$), 'T-1')!
  expect(w.git.main).toBe(H2)
  expect(t.status).toBe('done')
  expect(t.merged).toBe(H2)
  expect(t.runs!.at(-1)!.commits).toContain(H2)
  expect(t.runs!.at(-1)!.ended_note).toBe('merged')
  expect(t.history.at(-1)).toBe(`try 1: its checking and merging was given up as stuck, but it ended late and its work was merged into main (${H2.slice(0, 8)}), so it is done`)
  expect(leadQueue.filter(m => m.includes('T-1') && m.includes('done after all')).length).toBe(1)
})

test('a finish step given up while it moves main, which then lands, ends with the task done and its commits recorded, with no new try', async () => {
  S.me = 'me'
  const w = world()
  const { free, moving } = hangOnMove(w)
  await aboutToFinish(w)
  let ended = false
  void workerFinished(w.$, 'ag1', 'made the change').then(() => (ended = true))
  await turns(w, () => ended)
  expect(moving()).toBe(true)
  // given up: sent back to todo, the move still running
  let t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('todo')
  expect(t.attempts).toBe(1)
  free()
  await turns(w, () => find(w.files.has(BOARD) ? parseBoard(w.files.get(BOARD)!) : emptyBoard(), 'T-1')?.status === 'done')
  for (let i = 0; i < 500; i++) await Promise.resolve()
  t = find(await load(w.$), 'T-1')!
  expect(w.git.main).toBe(H1)
  expect(t.status).toBe('done')
  expect(t.merged).toBe(H1)
  expect(t.attempts).toBe(1)
  expect(t.runs!.at(-1)!.commits).toContain(H1)
  expect(t.runs!.at(-1)!.ended_by).toBe('finished')
  expect(t.runs!.at(-1)!.ended_note).toBe('merged')
  expect(leadQueue.filter(m => m.includes('T-1') && m.includes('done after all')).length).toBe(1)
})

// ---------------- waiting in line to merge, and retests after main moved, don't count toward the limit (T-226) ----------------

/**
 * A fake clock for the merge time limit: timers of at least a minute fire once `pass` moves the time
 * past them (a cancelled one never fires); the short ones (the lead's) never fire. `live`: the limit timers still running.
 */
function limitClock(w: ReturnType<typeof world>) {
  let at = 0
  const timers: { due: number; ms: number; f: () => void; off: boolean }[] = []
  ;(w.$ as unknown as { clock: { after: unknown } }).clock.after = (ms: number, f: () => void) => {
    if (ms < 60_000) return { cancel() {} }
    const x = { due: at + ms, ms, f, off: false }
    timers.push(x)
    return { cancel: () => void (x.off = true) }
  }
  const pass = (ms: number) => {
    at += ms
    for (const x of timers) if (!x.off && x.due <= at) (x.off = true), x.f()
  }
  return { pass, timers, live: () => timers.filter(x => !x.off) }
}

/** Every test command takes `ms` on the clock. */
function slowTests(w: ReturnType<typeof world>, pass: (ms: number) => void, ms: number) {
  w.onRun(async cmd => void (cmd.startsWith('/bin/sh -c ') && pass(ms)))
}

/** Promise turns until the step waits in line for its merge turn: its limit was started, then stopped. */
const inLine = (w: ReturnType<typeof world>, c: ReturnType<typeof limitClock>) => turns(w, () => c.timers.length > 0 && !c.live().length)

/** `n` earlier merges into main (other tasks finishing at the same time), one after another, each holding its turn until let go. */
function earlierMerges(n: number) {
  const free: (() => void)[] = []
  const ran: number[] = []
  const all = Array.from({ length: n }, (_, i) => mergeTurn('main', () => new Promise<void>(r => (ran.push(i), (free[i] = r)))))
  return { free, ran, all }
}

const MIN = 60_000

for (const [ahead, mins] of [[1, 8], [2, 6]] as const) {
  test(`${ahead + 1} tasks finishing together on one branch with a ${mins} min test command all merge: waiting in line is not counted`, async () => {
    S.me = 'me'
    const w = world()
    const c = limitClock(w)
    const { pass, timers } = c
    slowTests(w, pass, mins * MIN)
    await aboutToFinish(w)
    // the other tasks' merges are first in line; each takes as long as its tests
    const { free, ran, all } = earlierMerges(ahead)
    let ended = false
    void workerFinished(w.$, 'ag1', 'made the change').then(() => (ended = true))
    await inLine(w, c)
    for (let i = 0; i < ahead; i++) {
      await turns(w, () => ran.length === i + 1)
      expect(ranTests(w)).toEqual([])
      pass(mins * MIN)
      free[i]!()
      await all[i]
    }
    await turns(w, () => ended)
    // its wait in line and its own tests: over the limit together, well under it on its own
    expect((ahead + 1) * mins * MIN).toBeGreaterThan(finishLimitMs(1))
    const t = find(await load(w.$), 'T-1')!
    expect(t.status).toBe('done')
    expect(t.merged).toBe(H1)
    expect(w.git.main).toBe(H1)
    expect(ranTests(w).length).toBe(1)
    expect(leadQueue.some(x => x.includes('ran over'))).toBe(false)
    expect(timers.every(x => x.ms === finishLimitMs(1))).toBe(true)
  })
}

test('a task whose merge races with main moving, and is tested again, still merges when each go is under the limit', async () => {
  S.me = 'me'
  let races = 0
  const w = world({
    // another merge lands on main just before ours tries to move it, twice
    answer: a => {
      if (a[0] === 'update-ref' && races < 2) {
        races++
        w.git.main = races === 1 ? M2 : `d${races}`.padEnd(40, '0')
        w.git.upToDate = false
      }
      return undefined
    },
  })
  const { pass } = limitClock(w)
  // 10 min per go: 30 min in all, twice the 15 min limit
  slowTests(w, pass, 10 * MIN)
  await aboutToFinish(w)
  await workerFinished(w.$, 'ag1', 'made the change')
  expect(races).toBe(2)
  expect(ranTests(w).length).toBe(3)
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.merged).toBe(H2)
  expect(w.git.main).toBe(H2)
  expect(leadQueue.some(x => x.includes('ran over'))).toBe(false)
})

test('a step really stuck in its own merge turn is still given up after the limit, and the next one in line then goes on', async () => {
  S.me = 'me'
  const w = world()
  const c = limitClock(w)
  const { pass, live } = c
  // its test command hangs
  let hung = false
  w.onRun(async cmd => {
    if (!cmd.startsWith('/bin/sh -c ')) return
    hung = true
    await new Promise<void>(() => {})
  })
  await aboutToFinish(w)
  // one merge in front of it, 12 min long
  const { free, ran, all } = earlierMerges(1)
  let ended = false
  void workerFinished(w.$, 'ag1', 'made the change').then(() => (ended = true))
  // waiting in line: no limit running
  await inLine(w, c)
  expect(ran.length).toBe(1)
  // the next merge into main is in line after it
  let next = false
  const after = mergeTurn('main', async () => void (next = true))
  pass(12 * MIN)
  free[0]!()
  await all[0]
  await turns(w, () => hung)
  expect(live().length).toBe(1)
  // stuck in its own turn: still there just before the limit, given up at it
  pass(finishLimitMs(1) - 1)
  for (let i = 0; i < 500; i++) await Promise.resolve()
  expect(ended).toBe(false)
  expect(next).toBe(false)
  pass(1)
  await turns(w, () => ended)
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('todo')
  expect(leadQueue.filter(x => x.includes('T-1') && x.includes('ran over 15 minutes')).length).toBe(1)
  await after
  expect(next).toBe(true)
  expect(w.git.main).toBe(M1)
})

test('an approve waiting in line behind two slow merges, then main moving under it, still merges: neither the wait nor the first go counts', async () => {
  let raced = false
  const w = await inReview({ upToDate: false })
  // main moves just before the approve's first move
  w.git.answer = a => {
    if (a[0] === 'update-ref' && !raced) {
      raced = true
      w.git.main = M2
    }
    return undefined
  }
  const c = limitClock(w)
  const { pass } = c
  slowTests(w, pass, 10 * MIN)
  const { free, ran, all } = earlierMerges(2)
  let out: string | undefined
  void runTool(w.$, 'approve', { task: 'T-1' }).then(x => (out = String(x)))
  await inLine(w, c)
  for (let i = 0; i < 2; i++) {
    await turns(w, () => ran.length === i + 1)
    pass(6 * MIN)
    free[i]!()
    await all[i]
  }
  await turns(w, () => out !== undefined)
  // 12 min in line, then two goes of 10 min each
  expect(raced).toBe(true)
  expect(ranTests(w).length).toBe(2)
  expect(out).toBe(`T-1 approved and merged: merged into main (${H2.slice(0, 8)}); approved by the owner; tests passed`)
  expect(find(await load(w.$), 'T-1')!.status).toBe('done')
  expect(leadQueue.some(x => x.includes('ran over'))).toBe(false)
})

// ---------------- investigations: the hand-back is the result ----------------

/** T-1, an investigation, is "doing" with worker ag1 in `mode`, which then hands back `answer`. */
async function investigationAnswers(mode: 'auto' | 'review', answer: string, extra: Partial<BoardTask> = {}, rec: Rec = {}) {
  const w = world()
  const [b0] = boardWith(mode, ['npm test'], { kind: 'investigation', history: ['created by the lead'] } as Partial<BoardTask>)
  // set after the try started: a new try (attempts changing) clears the time fields
  const b = Object.keys(extra).length ? patchTask(b0, 'T-1', extra, ISO) : b0
  await saveBoard(w.$, recorded(b, rec))
  w.put(`${WT}/.git`, 'gitdir: x')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  await workerFinished(w.$, 'ag1', answer)
  return { w, t: find(await load(w.$), 'T-1')! }
}

for (const mode of ['auto', 'review'] as const)
  test(`an investigation's hand-back goes to review with its answer, and nothing is committed, tested or merged (mode ${mode})`, async () => {
    const { w, t } = await investigationAnswers(mode, 'The cache is never cleared: src/cache.ts has no expiry.\nI checked by reading it.')
    expect(t.status).toBe('review')
    expect(t.note).toBe('answered; waiting for you to read it')
    expect(t.answer).toBe('The cache is never cleared: src/cache.ts has no expiry.\nI checked by reading it.')
    expect(t.history.at(-1)).toMatch(/^try 1: answered: The cache is never cleared/)
    // the full hand-back is the report, as for any task
    expect(w.files.get(REPORT1)).toContain('The cache is never cleared')
    expect(w.calls.some(c => / git commit/.test(c))).toBe(false)
    expect(w.git.dirty).toBe(true)
    expect(ranTests(w)).toEqual([])
    expect(movedMain(w)).toBe(false)
    // its folder stays until the task ends
    expect(w.calls).not.toContain(`root: git worktree remove --force ${WT}`)
    expect(leadQueue.join('\n')).toContain('T-1 "Do it" is answered and waits for the owner to read it')
  })

test("a long investigation answer is cut on the task; the report keeps it all", async () => {
  const long = 'x'.repeat(ANSWER_MAX_CHARS + 500)
  const { w, t } = await investigationAnswers('auto', long)
  expect(t.answer!.length).toBe(ANSWER_MAX_CHARS)
  expect(t.answer!.endsWith('…')).toBe(true)
  expect(w.files.get(REPORT1)).toContain(long)
})

for (const mode of ['auto', 'review'] as const)
  test(`an investigation told to wrap up (time ran out) goes to review with its answer so far, not failed (mode ${mode})`, async () => {
    const { w, t } = await investigationAnswers(mode, 'So far: the cache is never cleared.', { wrap_up: new Date().toISOString(), time_ask: new Date().toISOString() })
    expect(t.status).toBe('review')
    expect(t.note).toBe('answered (time ran out); waiting for you to read it')
    expect(t.answer).toBe('So far: the cache is never cleared.')
    expect(t.wrap_up).toBeUndefined()
    expect(t.time_ask).toBeUndefined()
    expect(t.history.at(-1)).toMatch(/^try 1: answered \(time ran out after \d+ min\): So far/)
    expect(w.files.get(REPORT1)).toContain('So far: the cache is never cleared.')
    expect(w.calls.some(c => / git commit/.test(c))).toBe(false)
    expect(ranTests(w)).toEqual([])
    expect(movedMain(w)).toBe(false)
    expect(leadQueue.join('\n')).toContain('is answered (its time of')
  })

test('an investigation hand-back that restates the question ("Question: ... / Answer: ...") goes to review as answered', async () => {
  const body = 'Question: Which cache is never cleared?\nAnswer: the one in src/cache.ts; it has no expiry.'
  const { t } = await investigationAnswers('auto', body)
  expect(t.status).toBe('review')
  expect(t.note).toBe('answered; waiting for you to read it')
  expect(t.answer).toBe(body)
  expect(t.question ?? undefined).toBeUndefined()
})

test('an investigation answer that starts with "NEED FILES:" or "QUESTION:" goes to review as answered', async () => {
  for (const body of ['NEED FILES: path/a — example', 'QUESTION: Which cache do you mean?\nThat is all.']) {
    const { t } = await investigationAnswers('auto', body)
    expect(t.status).toBe('review')
    expect(t.answer).toBe(body)
    expect((t as { asked_files?: string[] }).asked_files).toBeUndefined()
  }
})

test('an investigation never waits for files', async () => {
  const { t } = await investigationAnswers('auto', 'The answer.', {}, { requested: ['path/a'] })
  expect(t.status).toBe('review')
})

test('an investigation worker that asks the owner (ask_owner) still waits for the owner', async () => {
  const { t } = await investigationAnswers('auto', 'I need to know.', {}, { question: { question: 'Which cache do you mean?' } })
  expect(t.status).toBe('waiting')
  expect(t.question).toBe('Which cache do you mean?')
  expect(t.answer).toBeUndefined()
})

test('Done (approve) on an answered investigation ends it done with nothing merged, and removes its folder and branch', async () => {
  const { w } = await investigationAnswers('auto', 'The answer.')
  const out = await runTool(w.$, 'approve', { task: 'T-1' })
  expect(out).toBe('T-1 done: the answer was read; nothing was merged')
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.note).toBe('answered')
  expect(t.merged).toBeUndefined()
  expect(t.history.at(-1)).toBe('try 1: the owner read the answer → done (nothing merged)')
  expect(movedMain(w)).toBe(false)
  expect(ranTests(w)).toEqual([])
  expect(w.calls.some(c => / git commit/.test(c))).toBe(false)
  expect(w.calls).toContain(`root: git worktree remove --force ${WT}`)
  expect(w.calls).toContain('root: git branch -D symcc/T-1')
  // no new task
  expect((await load(w.$)).tasks.length).toBe(1)
})

test('Keep as a note (approve with keep_note) ends it like Done and adds a docs task that writes docs/research/<topic>.md from the full answer', async () => {
  const { w } = await investigationAnswers('auto', 'The cache is never cleared.\nI read src/cache.ts.', { runs: startRun([], ISO) })
  const out = await runTool(w.$, 'approve', { task: 'T-1', keep_note: true })
  expect(out).toContain('T-1 done: the answer was read; nothing was merged. Added T-2')
  const b = await load(w.$)
  const t = find(b, 'T-1')!
  expect(t.status).toBe('done')
  expect(t.note).toBe('answered; kept as a note by T-2')
  expect(w.calls).toContain(`root: git worktree remove --force ${WT}`)
  expect(movedMain(w)).toBe(false)
  const n = find(b, 'T-2')!
  expect(n.status).toBe('todo')
  expect(n.role).toBe('docs')
  expect(kindOf(n)).toBe('change')
  expect(n.files).toEqual(['docs/research/do-it.md'])
  expect(n.origin).toMatchObject({ by: 'owner', task: 'T-1', how: 'follow-up' })
  expect(n.details).toContain('Write docs/research/do-it.md')
  expect(n.details).toContain('The cache is never cleared.\nI read src/cache.ts.')
  expect(n.details).toContain('.symcc/reports/T-1-try-1.md')
})

test('Ask more (reject) on an answered investigation sends it back to todo with the follow-up and the earlier answer in its details', async () => {
  const { w } = await investigationAnswers('auto', 'The cache is never cleared.', { runs: startRun([], ISO) })
  const out = await runTool(w.$, 'reject', { task: 'T-1', reason: 'And how big does it get?' })
  expect(out).toContain('T-1 asked more: back to "todo"')
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('todo')
  expect(t.note).toBe('asked more: And how big does it get?')
  expect(t.answer).toBeUndefined()
  expect(t.details).toContain('Follow-up question (owner, ')
  expect(t.details).toContain('And how big does it get?')
  expect(t.details).toContain('The earlier answer (try 1)')
  expect(t.details).toContain('The cache is never cleared.')
  expect(t.details).toContain('.symcc/reports/T-1-try-1.md')
  expect(t.history.at(-1)).toBe('try 1: the owner asked more: And how big does it get?')
  expect(movedMain(w)).toBe(false)
  await expect(runTool(w.$, 'reject', { task: 'T-1', reason: 'again' })).rejects.toThrow(/not ready for review/)
})

test('Ask more needs a follow-up question; keep_note is refused on a change task', async () => {
  const { w } = await investigationAnswers('auto', 'The answer.')
  await expect(runTool(w.$, 'reject', { task: 'T-1', reason: '  ' })).rejects.toThrow(/follow-up question/)
  expect(find(await load(w.$), 'T-1')!.status).toBe('review')
  const w2 = world()
  const [b] = boardWith('review', [], { status: 'review' })
  await saveBoard(w2.$, b)
  await expect(runTool(w2.$, 'approve', { task: 'T-1', keep_note: true })).rejects.toThrow(/keep_note is only for an answered investigation/)
  expect(find(await load(w2.$), 'T-1')!.status).toBe('review')
})

test('Ask more without a saved report points to the answer kept on the task; a long answer that does not fit points to the report', () => {
  const [b0] = boardWith('auto', [], { kind: 'investigation', status: 'review', answer: 'short answer' } as Partial<BoardTask>)
  const b1 = askMoreTask(b0, 'T-1', 'more please', '', undefined, ISO)
  expect(find(b1, 'T-1')!.details).toContain('The earlier answer (try 1):\nshort answer')
  const [b2] = boardWith('auto', [], { kind: 'investigation', status: 'review', details: 'd'.repeat(7000) } as Partial<BoardTask>)
  const b3 = askMoreTask(b2, 'T-1', 'more please', 'x'.repeat(3000), '.symcc/reports/T-1-try-1.md', ISO)
  expect(find(b3, 'T-1')!.details.endsWith('The earlier answer (try 1) is in .symcc/reports/T-1-try-1.md.')).toBe(true)
})

test('Ask more on long details keeps the new question and the report path, and stays within 8000 characters', () => {
  const [b0] = boardWith('auto', [], { kind: 'investigation', status: 'review', details: 'd'.repeat(7950) } as Partial<BoardTask>)
  const d = find(askMoreTask(b0, 'T-1', 'how big?', 'x'.repeat(500), '.symcc/reports/T-1-try-1.md', ISO), 'T-1')!.details
  expect(d.length).toBeLessThanOrEqual(8000)
  expect(d).toContain('): how big?\nThe earlier answer (try 1)')
  expect(d.endsWith('The earlier answer (try 1) is in .symcc/reports/T-1-try-1.md.')).toBe(true)
})

test('two Ask mores in a row after a long answer keep the second question and the try-2 report; the first answer becomes its report path', () => {
  const [b0] = boardWith('auto', [], { kind: 'investigation', status: 'review' } as Partial<BoardTask>)
  const b1 = askMoreTask(b0, 'T-1', 'first?', 'y'.repeat(7800), '.symcc/reports/T-1-try-1.md', ISO)
  expect(find(b1, 'T-1')!.details).toContain('y'.repeat(7800))
  const b2 = patchTask(b1, 'T-1', { status: 'review', attempts: 2 }, ISO)
  const d = find(askMoreTask(b2, 'T-1', 'second?', 'z'.repeat(3000), '.symcc/reports/T-1-try-2.md', ISO), 'T-1')!.details
  expect(d.length).toBeLessThanOrEqual(8000)
  expect(d).toContain('): first?\nThe earlier answer (try 1) is in .symcc/reports/T-1-try-1.md.')
  expect(d).toContain('): second?\nThe earlier answer (try 2)')
  expect(d).toContain('.symcc/reports/T-1-try-2.md')
  expect(d).not.toContain('yyy')
})

test('Keep as a note after two tries lists both reports, oldest first, and asks to combine them into the complete answer', async () => {
  const w = world()
  const runs = [
    { ...startRun([], ISO)[0]!, report: '.symcc/reports/T-1-try-1.md' },
    { ...startRun([], ISO)[0]!, report: '.symcc/reports/T-1-try-2.md' },
  ]
  const [b0] = boardWith('auto', [], { kind: 'investigation', history: ['created by the lead'] } as Partial<BoardTask>)
  await saveBoard(w.$, patchTask(b0, 'T-1', { status: 'review', attempts: 2, runs, answer: 'changes only' }, ISO))
  w.put(`${ROOT}/.symcc/reports/T-1-try-1.md`, 'The full first draft.')
  w.put(`${ROOT}/.symcc/reports/T-1-try-2.md`, 'Change point 2. Everything else is the same as try 1.')
  await runTool(w.$, 'approve', { task: 'T-1', keep_note: true })
  const d = find(await load(w.$), 'T-2')!.details
  expect(d).toContain('oldest first: .symcc/reports/T-1-try-1.md, .symcc/reports/T-1-try-2.md.')
  expect(d).toContain('combine them: write the final, complete answer, applying each later try\'s changes to the earlier answers')
  expect(d).toContain('The latest answer (try 2):\nChange point 2. Everything else is the same as try 1.')
  // one try: one report, as before
  const one = keepNoteTask(find(await load(w.$), 'T-1')!, 'a', ['.symcc/reports/T-1-try-1.md'])
  expect(one.details).toContain('The full answer is in .symcc/reports/T-1-try-1.md.')
  expect(one.details).not.toContain('combine')
})

test('a keep-note task after two tries reads both answers inside its own folder, and its commit holds only the note (T-284)', async () => {
  const w = world({ changed: ['docs/research/do-it.md'], current: 'main' })
  const runs = [
    { ...startRun([], ISO)[0]!, report: '.symcc/reports/T-1-try-1.md' },
    { ...startRun([], ISO)[0]!, report: '.symcc/reports/T-1-try-2.md' },
  ]
  const [b0] = boardWith('auto', [], { kind: 'investigation', history: ['created by the lead'] } as Partial<BoardTask>)
  await saveBoard(w.$, patchTask(b0, 'T-1', { status: 'review', attempts: 2, runs, answer: 'changes only' }, ISO))
  w.put(`${ROOT}/.symcc/reports/T-1-try-1.md`, 'The full first draft.')
  w.put(`${ROOT}/.symcc/reports/T-1-try-2.md`, 'Change point 2. Everything else is the same as try 1.')
  await runTool(w.$, 'approve', { task: 'T-1', keep_note: true })
  const n = find(await load(w.$), 'T-2')!
  expect(n.details).toContain('copied into your own folder at the same path when you start (git-ignored, never committed): read them there, not in the main project folder.')
  // the docs worker starts: both reports are copied into its folder, at the paths its details name
  S.me = 'me'
  S.startupDone = true
  S.driving = true
  workers.clear()
  let prompt = ''
  const x = w.$
  x.agents.spawn = async e => ((prompt = e.prompt), { agentId: 'ag9' })
  x.plugin = { name: 'symcc', root: '/plugin' }
  x.fs.list = async () => []
  await withStarts(w.$, startWorker(w.$, 'T-2'))
  const wt = `${ROOT}/.symcc/worktrees/T-2`
  expect(find(await load(w.$), 'T-2')!.status).toBe('doing')
  expect(prompt).toContain(wt)
  expect(prompt).toContain('.symcc/reports/T-1-try-1.md, .symcc/reports/T-1-try-2.md')
  expect(w.files.get(`${wt}/.symcc/reports/T-1-try-1.md`)).toBe('The full first draft.')
  expect(w.files.get(`${wt}/.symcc/reports/T-1-try-2.md`)).toBe('Change point 2. Everything else is the same as try 1.')
  // the copies are git-ignored in the folder, so git add -A leaves them out: the commit has only the note
  expect(w.files.get(`${wt}/.symcc/.gitignore`)).toBe('*\n')
  workers.clear()
  const [b2, t2] = [await load(w.$), find(await load(w.$), 'T-2')! as SymccTask]
  const r = await checkAndMerge(w.$, t2, wt, b2)
  expect(r.ok).toBe(true)
  expect(w.calls).toContain(`${wt}: git add -A -- .`)
  expect(t2.files).toEqual(['docs/research/do-it.md'])
})

test('T-470: on a host with no start queue (features.startQueue off) a worker starts at once: no queue, no wake-up line for the lead, no "starting at the next turn" note', async () => {
  const w = world({ current: 'main' })
  const [b0] = boardWith('auto')
  await saveBoard(w.$, patchTask(b0, 'T-1', { status: 'todo', attempts: 0 }, ISO))
  S.me = 'me'
  S.startupDone = true
  S.driving = true
  workers.clear()
  const notes: (string | undefined)[] = []
  const x = w.$
  x.features = { ...x.features, startQueue: false }
  x.agents.spawn = async () => (notes.push(find(await load(w.$), 'T-1')!.note), { agentId: 'ag1' })
  x.plugin = { name: 'symcc', root: '/plugin' }
  x.fs.list = async () => []
  // no drain (withStarts) here: startWorker itself starts the worker
  await startWorker(w.$, 'T-1')
  expect(notes.length).toBe(1)
  expect(queuedStarts()).toBe(0)
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('doing')
  expect(t.agent).toBe('ag1')
  expect(t.note).toBe('worker on it')
  expect(notes[0]).not.toBe(QUEUED_NOTE)
  expect(leadQueue).toEqual([])
  expect(w.toasts).toEqual([])
  workers.clear()
})

test('the investigation worker prompt after Ask more asks for the complete answer, not only what changed', () => {
  const [b0] = boardWith('auto', [], { kind: 'investigation', status: 'review' } as Partial<BoardTask>)
  expect(WORKER_PROMPT(b0.tasks[0]!, b0, WT)).not.toContain('complete answer')
  const b1 = askMoreTask(b0, 'T-1', 'and point 2?', 'first draft', undefined, ISO)
  const p = WORKER_PROMPT(find(b1, 'T-1')!, b1, WT)
  expect(p).toContain('hand back your complete answer, the whole updated text')
  expect(p).toContain('not only what changed')
})

test('Keep as a note never overwrites an existing research note: it picks <topic>-2.md', async () => {
  const { w } = await investigationAnswers('auto', 'Esc closes the panel.', { title: 'Esc in panels' })
  w.put(`${ROOT}/docs/research/esc-in-panels.md`, '# old note')
  ;(w.$ as unknown as { fs: Record<string, unknown> }).fs.list = async (dir: string) =>
    [...w.files.keys()].filter(p => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/')).map(p => ({ name: p.slice(dir.length + 1), kind: 'file' }))
  await runTool(w.$, 'approve', { task: 'T-1', keep_note: true })
  const n = find(await load(w.$), 'T-2')!
  expect(n.files).toEqual(['docs/research/esc-in-panels-2.md'])
  expect(n.details).toContain('Write docs/research/esc-in-panels-2.md')
})

test('two investigations with no Latin letters in their titles kept as notes get two different files, named after their ids', () => {
  let b: Board = emptyBoard()
  for (let i = 0; i < 2; i++) [b] = addTask(b, { origin: { why: 'a test' }, title: '为什么慢', kind: 'investigation' }, ISO)
  b = patchTask(patchTask(b, 'T-1', { status: 'review', attempts: 1 }, ISO), 'T-2', { status: 'review', attempts: 1 }, ISO)
  const n1 = keepNoteTask(find(b, 'T-1')!, 'slow because a', undefined, noteFilesInUse(b))
  ;[b] = addTask(b, n1, ISO)
  const n2 = keepNoteTask(find(b, 'T-2')!, 'slow because b', undefined, noteFilesInUse(b))
  expect(n1.files).toEqual(['docs/research/t-1.md'])
  expect(n2.files).toEqual(['docs/research/t-2.md'])
  // the same file name taken by an open task gets -2
  expect(keepNoteTask({ ...find(b, 'T-1')!, title: 'Do it' }, 'a', undefined, ['docs/research/do-it.md']).files).toEqual(['docs/research/do-it-2.md'])
})

test('the board list shows an answered investigation as "answer" with [investigation]; a change task in review is unchanged', () => {
  const [b] = boardWith('auto', [], { kind: 'investigation', status: 'review' } as Partial<BoardTask>)
  const t = b.tasks[0]!
  expect(statusCell(t, Date.now())).toBe('answer')
  expect(rowExtra(t, b.tasks)).toBe('[investigation]')
  const [c] = boardWith('auto', [], { status: 'review' })
  expect(statusCell(c.tasks[0]!, Date.now())).toBe('review')
  expect(rowExtra(c.tasks[0]!, c.tasks)).toBe('Enter to review')
  expect(rowExtra(find(patchTask(b, 'T-1', { status: 'todo' }, ISO), 'T-1')!, b.tasks)).toBe('[investigation]')
})

test('the task keys of an answered investigation are done, keep as a note and ask more; a change task in review keeps approve and reject', () => {
  expect(taskKeys('review', false, [], [], false, true).map(k => `${k.key} ${k.word}`).slice(0, 3)).toEqual(['a done', 'k keep as a note', 'x ask more'])
  expect(taskKeys('review').map(k => `${k.key} ${k.word}`).slice(0, 3)).toEqual(['a approve', 'x reject', 'd show changes'])
})

test('a researcher task added without kind is an investigation; with kind change it stays a change', () => {
  const b0 = emptyBoard()
  const [b1, a] = addTask(b0, { origin: { why: 'a test' }, title: 'Find out why', role: 'researcher' }, ISO)
  expect(a.kind).toBe('investigation')
  const [b2, c] = addTask(b1, { origin: { why: 'a test' }, title: 'Write the note', role: 'researcher', kind: 'change' }, ISO)
  expect(c.kind).toBeUndefined()
  expect(kindOf(c)).toBe('change')
  const [, d] = addTask(b2, { origin: { why: 'a test' }, title: 'Look into it', kind: 'investigation' }, ISO)
  expect(kindOf(d)).toBe('investigation')
  const [, e] = addTask(b2, { origin: { why: 'a test' }, title: 'Plain task' }, ISO)
  expect(e.kind).toBeUndefined()
  // kept through the board file
  expect(kindOf(find(parseBoard(JSON.stringify(b1)), a.id))).toBe('investigation')
})

test('change sets a task kind, and refuses an unknown one', async () => {
  const w = world()
  const [b] = addTask({ ...emptyBoard(), mode: 'auto' }, { origin: { why: 'a test' }, title: 'Do it', files: ['src/'], backlog: true }, ISO)
  await saveBoard(w.$, b)
  await runTool(w.$, 'change', { task: 'T-1', kind: 'investigation' })
  expect(kindOf(find(await load(w.$), 'T-1'))).toBe('investigation')
  await runTool(w.$, 'change', { task: 'T-1', kind: 'change' })
  expect(find(await load(w.$), 'T-1')!.kind).toBeUndefined()
  await expect(runTool(w.$, 'change', { task: 'T-1', kind: 'question' })).rejects.toThrow('Nothing changed: unknown kind "question"; the kinds are: change, bug, feature, refactor, docs, investigation')
})

// ---------------- task kinds (T-328): more kinds, all run as a change but investigation ----------------

test('add with kind bug saves kind bug; an unknown kind is refused naming the known kinds', async () => {
  const w = world()
  await saveBoard(w.$, { ...emptyBoard(), mode: 'auto' })
  // the kinds are read again: the built-in ones (kinds/index.ts), since this project has none of its own
  const add = (kind: string) => runTool(w.$, 'add', { title: 'Fix the cache', details: 'd', why: 'a test', origin_by: 'lead', backlog: true, kind })
  await add('Bug')
  expect(find(await load(w.$), 'T-1')!.kind).toBe('bug')
  await expect(add('chore')).rejects.toThrow('unknown kind "chore"; the kinds are: change, bug, feature, refactor, docs, investigation')
  expect((await load(w.$)).tasks.length).toBe(1)
  // change switches it between kinds; back to change stores none
  await runTool(w.$, 'change', { task: 'T-1', kind: 'change' })
  expect(find(await load(w.$), 'T-1')!.kind).toBeUndefined()
})

test('an off kind is refused by add (and by change), naming the kinds that are on (T-329)', async () => {
  const w = world()
  await saveBoard(w.$, { ...emptyBoard(), mode: 'auto' })
  // the owner's .symcc/kinds/bug.md turns the built-in bug kind off
  const mine = `${ROOT}/.symcc/kinds`
  w.put(mine, '')
  w.put(`${mine}/bug.md`, '---\ndescription: something that works wrongly\noff: true\n---\n')
  ;(w.$ as { fs: Record<string, unknown> }).fs.list = async (p: string) => (p === mine ? [{ name: 'bug.md', kind: 'file' }] : [])
  const add = (kind: string) => runTool(w.$, 'add', { title: 'Fix the cache', details: 'd', why: 'a test', origin_by: 'lead', backlog: true, kind })
  await expect(add('bug')).rejects.toThrow('kind "bug" is turned off (the owner can turn it on again: kinds action "on"); the kinds are: change, feature, refactor, docs, investigation')
  expect((await load(w.$)).tasks.length).toBe(0)
  await add('change')
  await expect(runTool(w.$, 'change', { task: 'T-1', kind: 'bug' })).rejects.toThrow('is turned off')
  expect(find(await load(w.$), 'T-1')!.kind).toBeUndefined()
})

test('a kind bug task is committed, tested and merged like a change', async () => {
  const w = world()
  const [b] = boardWith('auto', ['npm test'], { kind: 'bug', history: ['created by the lead'] } as Partial<BoardTask>)
  expect(b.tasks[0]!.kind).toBe('bug')
  await saveBoard(w.$, b)
  w.put(`${WT}/.git`, 'gitdir: x')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  await workerFinished(w.$, 'ag1', 'fixed it')
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.answer).toBeUndefined()
  expect(t.kind).toBe('bug')
  expect(ranTests(w)).toEqual(['/bin/sh -c npm test'])
  expect(movedMain(w)).toBe(true)
})

test('a kind investigation task still runs as an investigation: its answer waits for the owner, nothing merged', async () => {
  const { w, t } = await investigationAnswers('auto', 'It is slow because of X.')
  expect(t.kind).toBe('investigation')
  expect(t.status).toBe('review')
  expect(t.answer).toBe('It is slow because of X.')
  expect(ranTests(w)).toEqual([])
  expect(movedMain(w)).toBe(false)
})

test('old board tasks with kind change or investigation still load as before; another kind is kept', () => {
  const [b] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Old', files: ['src/'] }, ISO)
  const old = { ...b, tasks: [{ ...b.tasks[0]!, id: 'T-1', kind: 'change' }, { ...b.tasks[0]!, id: 'T-2', kind: 'investigation' }, { ...b.tasks[0]!, id: 'T-3', kind: 'Refactor' }, { ...b.tasks[0]!, id: 'T-4', kind: 42 }] }
  const p = parseBoard(JSON.stringify(old))
  expect(find(p, 'T-1')!.kind).toBeUndefined()
  expect(kindOf(find(p, 'T-1'))).toBe('change')
  expect(find(p, 'T-2')!.kind).toBe('investigation')
  expect(isAnswered({ ...find(p, 'T-2')!, status: 'review' })).toBe(true)
  expect(find(p, 'T-3')!.kind).toBe('refactor')
  expect(isAnswered({ ...find(p, 'T-3')!, status: 'review' })).toBe(false)
  expect(kindOf(find(p, 'T-4'))).toBe('change')
})

test('the board line shows the kind next to the role; a plain change shows none; search matches the kind', () => {
  const [b] = boardWith('auto', [], { kind: 'bug', role: 'tester', status: 'todo' } as Partial<BoardTask>)
  const t = b.tasks[0]!
  expect(rowExtra(t, b.tasks)).toBe('[bug · tester]')
  expect(rowExtra({ ...t, role: undefined }, b.tasks)).toBe('[bug]')
  expect(rowExtra({ ...t, kind: undefined } as SymccTask, b.tasks)).toBe('tester')
  expect(boardText(b, Date.now(), '~/p', 'symcc')).toContain('Do it [bug · tester]')
  expect(taskMatches(t, 'bug')).toBe(true)
  expect(taskMatches({ ...t, kind: undefined } as SymccTask, 'bug')).toBe(false)
})

test('the worker prompt says the task\'s kind and what it is for', () => {
  S.kinds = [{ name: 'bug', description: 'something that works wrongly', body: '' }]
  const [b] = boardWith('auto', ['npm test'], { kind: 'bug' } as Partial<BoardTask>)
  expect(WORKER_PROMPT(b.tasks[0]!, b, WT)).toContain('Kind of task: bug (something that works wrongly).')
  const [i] = boardWith('auto', ['npm test'], { kind: 'investigation' } as Partial<BoardTask>)
  expect(WORKER_PROMPT(i.tasks[0]!, i, WT)).toContain('Kind of task: investigation')
})

/** Commits on T-1's branch that main doesn't have, in the fake git (`git rev-list --count main..branch`). */
const aheadBy = (n: number) => (args: string[]) => (args[0] === 'rev-list' && args[1] === '--count' ? ok(`${n}\n`) : undefined)

test('switching a failed change task with commits on its branch to an investigation is refused', async () => {
  const w = world({ answer: aheadBy(2) })
  const [b] = boardWith('auto', [], { status: 'failed' })
  await saveBoard(w.$, b)
  w.put(`${WT}/.git`, 'gitdir: x')
  await expect(runTool(w.$, 'change', { task: 'T-1', kind: 'investigation' })).rejects.toThrow('Nothing changed: T-1 has work from earlier tries on its branch; drop it or make a new task for the investigation')
  const t = find(await load(w.$), 'T-1')!
  expect(kindOf(t)).toBe('change')
  expect(t.status).toBe('failed')
  expect(w.calls.some(c => /worktree remove|branch -D|reset/.test(c))).toBe(false)
})

test('switching a failed change task with uncommitted work in its folder to an investigation is refused', async () => {
  const w = world({ wtStatus: ' M src/a.ts' })
  const [b] = boardWith('auto', [], { status: 'failed' })
  await saveBoard(w.$, b)
  w.put(`${WT}/.git`, 'gitdir: x')
  await expect(runTool(w.$, 'change', { task: 'T-1', kind: 'investigation' })).rejects.toThrow(/T-1 has work from earlier tries on its branch or in its folder/)
  expect(kindOf(find(await load(w.$), 'T-1')!)).toBe('change')
})

test('switching a backlog task with no folder or commits to an investigation still works', async () => {
  const w = world()
  const [b] = addTask({ ...emptyBoard(), mode: 'auto' }, { origin: { why: 'a test' }, title: 'Do it', files: ['src/'], backlog: true }, ISO)
  await saveBoard(w.$, b)
  await runTool(w.$, 'change', { task: 'T-1', kind: 'investigation' })
  const t = find(await load(w.$), 'T-1')!
  expect(kindOf(t)).toBe('investigation')
  expect(t.status).toBe('backlog')
})

test('Done on an investigation whose branch has commits from a change try keeps the branch and says so', async () => {
  const { w } = await investigationAnswers('auto', 'The answer.')
  w.git.answer = aheadBy(1)
  const out = await runTool(w.$, 'approve', { task: 'T-1' })
  expect(out).toContain('T-1 done: the answer was read; nothing was merged')
  expect(out).toContain('Its branch symcc/T-1 was kept: it has 1 commit from an earlier change try that main doesn\'t have')
  expect(find(await load(w.$), 'T-1')!.status).toBe('done')
  expect(w.calls).toContain(`root: git worktree remove --force ${WT}`)
  expect(w.calls.some(c => /branch -D/.test(c))).toBe(false)
  expect(leadQueue.join('\n')).toContain('Its branch symcc/T-1 was kept')
})

test('Done on an investigation throws its scratch edits away before removing its folder', async () => {
  const { w } = await investigationAnswers('auto', 'The answer.')
  await runTool(w.$, 'approve', { task: 'T-1' })
  const reset = w.calls.indexOf('wt: git reset -q --hard')
  expect(reset).toBeGreaterThan(-1)
  expect(w.calls).toContain('wt: git clean -fdq')
  expect(reset).toBeLessThan(w.calls.indexOf(`root: git worktree remove --force ${WT}`))
  expect(w.calls.some(c => / git commit/.test(c))).toBe(false)
})

test("switching an investigation with scratch edits to a change throws them away, so they are never committed", async () => {
  const w = world({ wtStatus: ' M src/a.ts' })
  // the fake git: a reset clears the folder's changes
  w.git.answer = args => (args[0] === 'reset' ? ((w.git.dirty = false), (w.git.wtStatus = ''), ok()) : undefined)
  const [b] = boardWith('auto', [], { kind: 'investigation', status: 'review', answer: 'The answer.' } as Partial<BoardTask>)
  await saveBoard(w.$, b)
  w.put(`${WT}/.git`, 'gitdir: x')
  await runTool(w.$, 'change', { task: 'T-1', kind: 'change' })
  const t = find(await load(w.$), 'T-1')!
  expect(kindOf(t)).toBe('change')
  expect(w.calls).toContain('wt: git reset -q --hard')
  expect(w.calls).toContain('wt: git clean -fdq')
  expect(w.git.dirty).toBe(false)
  expect(w.calls.some(c => / git (commit|add)/.test(c))).toBe(false)
})

test('a refused switch of an investigation to a change leaves its scratch edits alone', async () => {
  const w = world({ wtStatus: ' M src/a.ts' })
  w.git.answer = args => (args[0] === 'reset' ? ((w.git.dirty = false), (w.git.wtStatus = ''), ok()) : undefined)
  const [b] = boardWith('auto', [], { kind: 'investigation', status: 'review', answer: 'The answer.' } as Partial<BoardTask>)
  await saveBoard(w.$, b)
  w.put(`${WT}/.git`, 'gitdir: x')
  await expect(runTool(w.$, 'change', { task: 'T-1', kind: 'change', backlog: true })).rejects.toThrow('only a task that is to do, paused or failed can go to the backlog')
  const t = find(await load(w.$), 'T-1')!
  expect(kindOf(t)).toBe('investigation')
  expect(t.status).toBe('review')
  expect(w.calls.some(c => /git (reset|clean)/.test(c))).toBe(false)
  expect(w.git.wtStatus).toBe(' M src/a.ts')
})

test('a researcher task of kind change is committed, tested and merged as today', async () => {
  const w = world()
  const [b] = boardWith('auto', ['npm test'], { role: 'researcher', history: ['created by the lead'] })
  await saveBoard(w.$, b)
  w.put(`${WT}/.git`, 'gitdir: x')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  await workerFinished(w.$, 'ag1', 'wrote the note')
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.answer).toBeUndefined()
  expect(ranTests(w)).toEqual(['/bin/sh -c npm test'])
  expect(movedMain(w)).toBe(true)
})

test('the worker prompt of an investigation asks for the answer in full and says file changes are not kept; a change keeps its prompt', () => {
  const [b] = boardWith('auto', ['npm test'], { kind: 'investigation' } as Partial<BoardTask>)
  const p = WORKER_PROMPT(b.tasks[0]!, b, WT)
  expect(p).toContain('This task is an investigation: your job is to find the answer and hand it back in full.')
  expect(p).toContain('any file changes you make in the project are not kept')
  expect(p).not.toContain('Files you may change')
  expect(p).not.toContain('these must pass')
  const [c] = boardWith('auto', ['npm test'])
  const q = WORKER_PROMPT(c.tasks[0]!, c, WT)
  expect(q).toContain('Files you may change: src/.')
  expect(q).not.toContain('investigation')
})

// ---------------- one task's tests at a time, project-wide (T-416) ----------------

const TLOCK = `${ROOT}/.symcc/tests.lock`
const CHECKING_NOTE = 'checking and merging'

/** A board with T-1 and T-2 both "doing", their work being checked right now (a fresh check mark), each noted "checking and merging". */
async function twoChecking(w: ReturnType<typeof world>, t2: Partial<BoardTask> = {}): Promise<[SymccTask, SymccTask]> {
  const [b0] = boardWith('auto', ['npm test'])
  let [b] = addTask(b0, { origin: { why: 'a test' }, title: 'Other', files: ['lib/'] }, ISO)
  // status first: a check mark given with a change of status is dropped (patchTask)
  for (const id of ['T-1', 'T-2']) {
    b = patchTask(b, id, { status: 'doing', attempts: 1 }, ISO)
    b = patchTask(b, id, { note: CHECKING_NOTE, checking: { step: 'merging', at: new Date().toISOString() }, ...(id === 'T-2' ? t2 : {}) }, ISO)
  }
  await saveBoard(w.$, b)
  return [find(b, 'T-1')!, find(b, 'T-2')!]
}
const noteOf = (w: ReturnType<typeof world>, id: string) => find(parseBoard(w.files.get(BOARD)!), id)!.note
const lockTask = (w: ReturnType<typeof world>) => parseTestLock(w.files.get(TLOCK) ?? null)?.task

test('two tasks reaching their tests at once run them one after the other; the second waits with a note, its time limit stopped', async () => {
  S.me = 'me'
  const w = world()
  const [t1, t2] = await twoChecking(w)
  const log: string[] = []
  let open = () => {}
  const gate = new Promise<void>(r => (open = r))
  const seen: (string | undefined)[] = []
  w.onSleep(() => {
    seen.push(noteOf(w, 'T-2'))
    if (seen.length === 3) open()
  })
  const turn1: boolean[] = []
  const turn2: boolean[] = []
  const one = withTestLock(w.$, t1, () => undefined, go => turn1.push(go), async () => (log.push(`T-1 start (lock ${lockTask(w)})`), await gate, log.push('T-1 end'), 'one'))
  const two = withTestLock(w.$, t2, () => undefined, go => turn2.push(go), async () => (log.push(`T-2 start (lock ${lockTask(w)})`), 'two'))
  expect(await one).toBe('one')
  expect(await two).toBe('two')
  expect(log).toEqual(['T-1 start (lock T-1)', 'T-1 end', 'T-2 start (lock T-2)'])
  // every look while it waits names T-1 (never itself, even when T-1 lets go between its try and its look)
  expect(seen.length).toBeGreaterThanOrEqual(3)
  expect(seen.every(n => n === waitingTestsNote('T-1'))).toBe(true)
  expect(waitingTestsNote('T-5')).toBe("waiting for another task's tests (T-5)")
  expect(w.sleeps.every(ms => ms === TEST_LOCK_POLL_MS)).toBe(true)
  // the waiting one's time limit stops while it waits and starts again once its tests begin; the first never waited
  expect(turn1).toEqual([])
  expect(turn2).toEqual([false, true])
  expect(noteOf(w, 'T-2')).toBe(CHECKING_NOTE)
  expect(w.files.has(TLOCK)).toBe(false)
})

test('a test lock older than 20 minutes is taken over at once', async () => {
  S.me = 'me'
  const w = world()
  const [t1] = await twoChecking(w)
  w.put(TLOCK, testLockText('T-2', 'other-session', 0))
  let held: string | undefined
  expect(await withTestLock(w.$, t1, () => undefined, undefined, async () => ((held = lockTask(w)), 'ran'))).toBe('ran')
  expect(held).toBe('T-1')
  expect(w.sleeps).toEqual([])
  expect(w.files.has(TLOCK)).toBe(false)
})

test('a fresh test lock whose task is no longer being checked is taken over at once', async () => {
  S.me = 'me'
  const w = world()
  const [t1] = await twoChecking(w, { status: 'todo', checking: undefined })
  w.put(TLOCK, testLockText('T-2', 'other-session', Date.now()))
  expect(await withTestLock(w.$, t1, () => undefined, undefined, async () => lockTask(w))).toBe('T-1')
  expect(w.sleeps).toEqual([])
  expect(w.files.has(TLOCK)).toBe(false)
})

test('a fresh test lock left by an earlier go of the same task (say before a reload) is taken over at once', async () => {
  S.me = 'me'
  const w = world()
  const [t1] = await twoChecking(w)
  w.put(TLOCK, testLockText('T-1', 'me', Date.now()))
  expect(await withTestLock(w.$, t1, () => undefined, undefined, async () => 'ran')).toBe('ran')
  expect(w.sleeps).toEqual([])
  expect(w.files.has(TLOCK)).toBe(false)
})

test('the test lock is held while the merge step tests, and let go after a failing test', async () => {
  S.me = 'me'
  const w = world({}, { 'npm test': { exitCode: 2, stdout: '1 test failed', stderr: '' } })
  const [b, t] = boardWith('auto', ['npm test'])
  await saveBoard(w.$, b)
  const during: (string | undefined)[] = []
  w.onRun(async cmd => void (cmd.startsWith('/bin/sh -c ') && during.push(lockTask(w))))
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r.ok).toBe(false)
  expect(r.detail).toContain('tests failed')
  expect(during).toEqual(['T-1'])
  expect(w.files.has(TLOCK)).toBe(false)
})

test('three tasks waiting for the test lock get it oldest first, even when the newest one looks first after it is let go', async () => {
  S.me = 'me'
  const w = world()
  const [b0] = boardWith('auto', ['npm test'])
  let b = b0
  for (const title of ['Second', 'Third', 'Holder']) [b] = addTask(b, { origin: { why: 'a test' }, title, files: ['lib/'] }, ISO)
  for (const id of ['T-1', 'T-2', 'T-3', 'T-4']) {
    b = patchTask(b, id, { status: 'doing', attempts: 1 }, ISO)
    b = patchTask(b, id, { note: CHECKING_NOTE, checking: { step: 'merging', at: new Date().toISOString() } }, ISO)
  }
  await saveBoard(w.$, b)
  // T-4, in another session, holds the lock while T-1, T-2 and T-3 (in that order) come to their tests
  w.put(TLOCK, testLockText('T-4', 'other-session', Date.now()))
  const log: string[] = []
  let looks3 = 0
  // T-3 (the newest) lets T-4's lock go just before its own look, so it is the first to look once the lock is free
  const stopped3 = () => {
    if (++looks3 === 2) w.files.delete(TLOCK)
    return undefined
  }
  const go = (t: SymccTask, stopped: () => undefined) => withTestLock(w.$, t, stopped, undefined, async () => (log.push(`${t.id} (lock ${lockTask(w)})`), t.id))
  const runs = [go(find(b, 'T-1')!, () => undefined), go(find(b, 'T-2')!, () => undefined), go(find(b, 'T-3')!, stopped3)]
  expect(await Promise.all(runs)).toEqual(['T-1', 'T-2', 'T-3'])
  expect(looks3).toBeGreaterThanOrEqual(2)
  expect(log).toEqual(['T-1 (lock T-1)', 'T-2 (lock T-2)', 'T-3 (lock T-3)'])
  expect(w.files.has(TLOCK)).toBe(false)
})

test('the test lock is dated again before each test command, so a long run of several commands is never taken over as stale', async () => {
  S.me = 'me'
  const w = world()
  const [b, t] = boardWith('auto', ['npm test', 'npm run e2e', 'npm run lint'])
  await saveBoard(w.$, b)
  // each command may take up to TEST_TIMEOUT_MS; three in a row are more than the 20 minutes after which a lock is stale
  expect(3 * TEST_TIMEOUT_MS).toBeGreaterThan(TEST_LOCK_STALE_MS)
  const steps: string[] = []
  w.onRun(async cmd => {
    if (cmd.startsWith('mv -f ') && cmd.endsWith(` ${TLOCK}`)) steps.push(`lock dated (${lockTask(w)})`)
    if (cmd.startsWith('/bin/sh -c ')) steps.push(cmd.slice('/bin/sh -c '.length))
  })
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r.ok).toBe(true)
  expect(steps).toEqual(['lock dated (T-1)', 'npm test', 'lock dated (T-1)', 'npm run e2e', 'lock dated (T-1)', 'npm run lint'])
  expect(w.files.has(TLOCK)).toBe(false)
})

test('the test lock is let go when the check is stopped after a test, and when the tests throw', async () => {
  S.me = 'me'
  const w = world()
  const [b, t] = boardWith('auto', ['npm test', 'npm run e2e'])
  await saveBoard(w.$, b)
  const r = await checkAndMerge(w.$, t, WT, b, 'finish', [], () => (ranTests(w).length ? 'dropped' : undefined))
  expect(r).toEqual({ ok: false, detail: 'not merged: the task was dropped while it was being checked' })
  expect(ranTests(w)).toEqual(['/bin/sh -c npm test'])
  expect(w.files.has(TLOCK)).toBe(false)
  await expect(withTestLock(w.$, t, () => undefined, undefined, async () => Promise.reject(new Error('broke')))).rejects.toThrow('broke')
  expect(w.files.has(TLOCK)).toBe(false)
})

test('a task stopped while it waits for the test lock stops waiting, runs nothing, and leaves the other lock alone', async () => {
  S.me = 'me'
  const w = world()
  const [t1] = await twoChecking(w)
  const theirs = testLockText('T-2', 'other-session', Date.now())
  w.put(TLOCK, theirs)
  let why: string | undefined
  w.onSleep(() => (why = 'paused'))
  const stopped = () => (why ? { ok: false, detail: `not merged: the task was ${why} while it was being checked` } : undefined)
  let ran = false
  const r = await withTestLock(w.$, t1, stopped, undefined, async () => ((ran = true), undefined))
  expect(r).toEqual({ ok: false, detail: 'not merged: the task was paused while it was being checked' })
  expect(ran).toBe(false)
  expect(w.files.get(TLOCK)).toBe(theirs)
  expect(noteOf(w, 'T-1')).toBe(CHECKING_NOTE)
})

test('a finished task waiting a long time for another task\'s tests still merges: the wait counts neither as running over nor as hung', async () => {
  S.me = 'me'
  const w = world()
  const c = limitClock(w)
  await aboutToFinish(w)
  // T-2, in another session, is running its tests now and holds the test lock
  await change(w.$, x => {
    const [y] = addTask(x, { origin: { why: 'a test' }, title: 'Other', files: ['lib/'] }, ISO)
    const z = patchTask(y, 'T-2', { status: 'doing', attempts: 1 }, ISO)
    return patchTask(z, 'T-2', { checking: { step: 'testing', at: new Date().toISOString() } }, ISO)
  })
  w.put(TLOCK, testLockText('T-2', 'other-session', Date.now()))
  const notes: (string | undefined)[] = []
  let waits = 0
  // each look at the lock takes 5 min on the limit's clock; after 12 looks (an hour, four times the limit) T-2 lets go
  w.onSleep(() => {
    if (w.sleeps.at(-1) !== TEST_LOCK_POLL_MS) return
    notes.push(noteOf(w, 'T-1'))
    c.pass(5 * MIN)
    if (++waits === 12) w.files.delete(TLOCK)
  })
  await workerFinished(w.$, 'ag1', 'made the change')
  expect(waits).toBe(12)
  expect(12 * 5 * MIN).toBeGreaterThan(2 * finishLimitMs(1))
  expect(notes.every(n => n === waitingTestsNote('T-2'))).toBe(true)
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('done')
  expect(t.merged).toBe(H1)
  expect(ranTests(w)).toEqual(['/bin/sh -c npm test'])
  expect(leadQueue.some(x => x.includes('ran over'))).toBe(false)
  expect(w.files.has(TLOCK)).toBe(false)
})

// ---------------- T-491: a worker that can't start ----------------

/**
 * A world in auto mode with T-1 to do (the extra fields in `extra`), driven by this session, on a host with no start
 * queue (so pump starts the worker itself); `spawn` answers the worker's start. `spawned` counts the starts asked for.
 */
async function cantStartWorld(spawn: () => Promise<{ agentId?: string }>, extra: Partial<BoardTask> = {}, g: Partial<Git> = {}) {
  const w = world({ current: 'main', ...g })
  const [b0] = boardWith('auto')
  await saveBoard(w.$, patchTask(b0, 'T-1', { status: 'todo', attempts: 0, ...extra }, ISO))
  S.me = 'me'
  S.startupDone = true
  S.driving = true
  workers.clear()
  let spawned = 0
  const x = w.$
  x.features = { ...x.features, startQueue: false }
  x.agents.spawn = async () => (spawned++, spawn())
  x.plugin = { name: 'symcc', root: '/plugin' }
  x.fs.list = async () => []
  return { w, spawned: () => spawned, t1: async () => find(await load(w.$), 'T-1')! }
}

const cantStartLines = () => leadQueue.filter(l => l.startsWith("T-1 couldn't start"))

test("T-491: a worker start the host refuses fails the task once: note \"couldn't start: <why>\", one try counted, one line to the lead", async () => {
  const c = await cantStartWorld(() => Promise.reject(new Error('no agents allowed here')))
  await pump(c.w.$)
  const t = await c.t1()
  expect(c.spawned()).toBe(1)
  expect(t.status).toBe('failed')
  expect(t.note!.startsWith("couldn't start: no agents allowed here")).toBe(true)
  expect(t.attempts).toBe(1)
  expect(cantStartLines()).toEqual(["T-1 couldn't start: no agents allowed here"])
  cleanUp()
})

test("T-491: a worker type not loaded yet puts the task back as it was twice (no try counted); the 3rd miss fails it as \"couldn't start\"", async () => {
  const c = await cantStartWorld(() => Promise.reject(Object.assign(new Error("Agent type 'symcc:worker' not found"), { notReady: true })), { note: 'waiting for its turn', runs: [{ started: ISO, ended: ISO }] })
  const runs = (await c.t1()).runs
  expect(runs?.length).toBe(1)
  for (const n of [1, 2]) {
    await pump(c.w.$)
    const t = await c.t1()
    expect(c.spawned()).toBe(n)
    expect(t.status).toBe('todo')
    expect(t.attempts).toBe(0)
    // T-1 had no branch before; the claim gave it 'symcc/T-1', so an empty branch shows the old one was put back.
    expect(t.branch ?? null).toBeNull()
    expect(t.note).toBe('waiting for its turn')
    expect(t.runs).toEqual(runs)
    expect(cantStartLines()).toEqual([])
  }
  await pump(c.w.$)
  const t = await c.t1()
  expect(c.spawned()).toBe(3)
  expect(t.status).toBe('failed')
  expect(t.note!.startsWith("couldn't start: Agent type 'symcc:worker' not found")).toBe(true)
  expect(cantStartLines().length).toBe(1)
  cleanUp()
})

test('T-491: a worker start that answers no agent id fails the task with "couldn\'t start: the worker did not start"', async () => {
  const c = await cantStartWorld(async () => ({ agentId: '' }))
  await pump(c.w.$)
  const t = await c.t1()
  expect(t.status).toBe('failed')
  expect(t.note).toBe("couldn't start: the worker did not start")
  expect(workers.size).toBe(0)
  expect(cantStartLines()).toEqual(["T-1 couldn't start: the worker did not start"])
  cleanUp()
})

test("T-491: when git can't make the task's folder (worktree add fails), the task fails with git's words and no worker is asked for", async () => {
  const fatal = `fatal: '${WT}' already exists`
  const c = await cantStartWorld(async () => ({ agentId: 'ag1' }), {}, { answer: args => (args[0] === 'worktree' && args[1] === 'add' ? fail(fatal, 128) : undefined) })
  await pump(c.w.$)
  const t = await c.t1()
  expect(c.spawned()).toBe(0)
  expect(t.status).toBe('failed')
  expect(t.note!.startsWith("couldn't start: git worktree add")).toBe(true)
  expect(t.note).toContain(fatal)
  expect(cantStartLines().length).toBe(1)
  cleanUp()
})
