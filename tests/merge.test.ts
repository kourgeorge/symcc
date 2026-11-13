import { expect, test } from 'claude-code/testing'
import type { SymccTask } from '../types'
import { type Board, addTask, emptyBoard, patchTask, lockText, parseBoard, outOfScopeText, blockedText, mergeBlockers, find, onConflict, spokenLine, statText, REPORT_MAX_CHARS, startRun, withEnd, fmtRun, backToTodo, finishedNote } from '../hooks/board'
import { checkAndMerge, changedFiles, changesText } from '../hooks/plugin/review'
import { removeWorktree } from '../hooks/plugin/git'
import { S, leadQueue, workers, sayQueue, meanwhile } from '../hooks/plugin/state'
import { tellLead, noteForLead, meanwhileText } from '../hooks/plugin/tell'
import { saidNeedsYou, findPlayers, playable, playsFor, sayNext, sayDone, WIN_TEXT_VAR } from '../hooks/plugin/voice'
import { workerFinished, setSymcc, setBoardMode, check } from '../hooks/plugin/workers'
import { change, load, saveBoard, takeLock, dropLock } from '../hooks/plugin/store'
import { runTool, ownerSettings, allowAskedFiles, refuseAskedFiles } from '../hooks/plugin/tools'
import { archiveOld } from '../hooks/plugin/archive'

// The test runtime can't run a real process or touch real files: it has no node: imports, no Bun or
// process globals, and nothing below the plugin answers $.fs or $.process.run. So these tests run the
// real merge, approve and board code against a scripted fake git and in-memory files (see world()).

const ROOT = '/repo'
const WT = `${ROOT}/.symcc/worktrees/T-1`
const BOARD = `${ROOT}/.symcc/board.json`
const LOCK = `${ROOT}/.symcc/board.lock`
const T0 = 1_800_000_000_000
const ISO = '2026-11-13T00:00:00.000Z'
// commit ids for the fake git: main (M1, M2), the worker's branch (H0 before its commit, H1 after, H2 after a merge of main,
// H3 after a commit of the owner's edits on top of H1), an older base (B0)
const [M1, M2, H0, H1, H2, B0, H3] = ['a1', 'a2', 'b0', 'b1', 'b2', 'c0', 'b3'].map(x => x.repeat(20)) as [string, string, string, string, string, string, string]

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
  answer?: (args: string[], cwd: string) => Res | undefined
}

/** Board file contents, the fake git, the commands run, and a `$` for the plugin code that uses them. */
function world(g: Partial<Git> = {}, tests: Record<string, Res> = {}) {
  const git: Git = { main: M1, head: H0, dirty: true, upToDate: true, conflict: false, changed: ['src/a.ts'], current: 'other', status: '', wtStatus: '', ...g }
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
    if (a[0] === 'commit') {
      if (!git.dirty) return fail('nothing to commit')
      git.dirty = false
      git.wtStatus = ''
      git.head = git.head === H0 ? H1 : H3
      return ok()
    }
    if (s === 'rev-parse -q --verify HEAD' || s === 'rev-parse HEAD') return ok(git.head)
    if (s === `rev-parse refs/heads/main`) return ok(git.main)
    if (a[0] === 'merge-base' && a[1] === '--is-ancestor') return git.upToDate ? ok() : fail()
    if (a[0] === 'merge-base') return ok(git.upToDate ? git.main : B0)
    // without -z, git quotes unusual names the way it does by default (core.quotePath): "docs/caf\303\251.md"
    if (a[0] === 'diff' && a.includes('--name-only')) return ok(a.includes('-z') ? git.changed.join('\0') : git.changed.map(quoted).join('\n'))
    if (s === 'merge --abort') return ok()
    if (a[0] === 'merge') {
      if (git.conflict) return { exitCode: 1, stdout: 'CONFLICT (content): Merge conflict in src/a.ts', stderr: '' }
      git.head = H2
      return ok()
    }
    if (s === 'symbolic-ref --short -q HEAD') return git.current ? ok(git.current) : fail()
    if (a[0] === 'status') return ok(cwd === WT ? git.wtStatus : git.status)
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

  async function answerRun(argv: string[], o: { cwd?: string }): Promise<Res> {
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

  const $ = {
    process: {
      run: async (argv: string[], o: { cwd?: string } = {}): Promise<Res> => {
        const r = await answerRun(argv, o)
        await afterRun(calls.at(-1)!)
        return r
      },
    },
    fs: {
      exists: async (p: string) => files.has(p),
      read: async (p: string) => {
        if (!files.has(p)) throw new Error(`no file ${p}`)
        return files.get(p)!
      },
      write: async (p: string, text: string) => put(p, text),
      stat: async (p: string) => {
        if (!files.has(p)) throw new Error(`no file ${p}`)
        return { mtimeMs: mtime.get(p)! }
      },
    },
    session: { id: async () => 'me', send: async () => undefined },
    agent: { list: async () => [] },
    ui: { toast: (t: unknown) => void toasts.push(JSON.stringify(t)), status: () => undefined },
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
    prompt: { submit: async () => undefined },
    // the panel's state values (publish writes the view there): kept here, never read by these tests
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
  return { $: $ as never, git, files, calls, toasts, put, sleeps, onSleep: (f: () => void) => void (afterSleep = f), onRun: (f: (cmd: string) => Promise<void>) => void (afterRun = f) }
}

/** A board with one task T-1 (files src/), in `mode`, with `test_commands`. */
function boardWith(mode: 'auto' | 'review', test_commands: string[] = [], extra: Partial<SymccTask> = {}): [Board, SymccTask] {
  const [b, t] = addTask({ ...emptyBoard('main'), mode, test_commands }, { origin: { why: 'a test' }, title: 'Do it', files: ['src/'] }, ISO)
  const b2 = patchTask(b, t.id, { status: 'doing', attempts: 1, ...extra }, ISO)
  return [b2, b2.tasks[0]!]
}

// ---------------- the board store ----------------

test('saveBoard then load gives back the same board, written through a temp file', async () => {
  const w = world()
  const [b] = boardWith('auto', ['npm test'])
  await saveBoard(w.$, b)
  expect(w.files.has(`${BOARD}.tmp`)).toBe(false)
  expect(w.calls).toContain(`mv -f ${BOARD}.tmp ${BOARD}`)
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
  const text = '{"version":1,"tasks":[{"id":"T-1",}]} change-test'
  w.put(BOARD, text)
  let ran = false
  const err = await change(w.$, x => ((ran = true), x)).then(() => null, (e: Error) => e.message)
  expect(err).toMatch(/board\.json can't be read/)
  expect(ran).toBe(false)
  expect(w.files.get(BOARD)).toBe(text)
  expect(w.files.has(`${BOARD}.tmp`)).toBe(false)
  const copies = [...w.files.entries()].filter(([p]) => p.startsWith(`${BOARD}.broken-`))
  expect(copies.map(([, t]) => t)).toEqual([text])
  expect(w.toasts.some(t => /board\.json can't be read/.test(t))).toBe(true)
  expect(w.files.has(LOCK)).toBe(false)
})

test('saveBoard says so when the board cannot be moved into place', async () => {
  const w = world()
  const run = (w.$ as { process: { run: (a: string[]) => Promise<Res> } }).process
  const real = run.run
  run.run = async (a: string[]) => (a[0] === 'mv' ? fail('mv: Permission denied') : real(a))
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
  expect(r).toEqual({ ok: false, detail: outOfScopeText(['docs/x.md'], ['src/']) })
  expect(ranTests(w)).toEqual([])
  expect(w.git.main).toBe(M1)
})

test('checkAndMerge brings the branch up to date when main moved on, tests that, and merges it', async () => {
  const w = world({ upToDate: false })
  const [b, t] = boardWith('auto', ['npm test'])
  const made: string[] = []
  const r = await checkAndMerge(w.$, t, WT, b, 'finish', made)
  expect(r).toEqual({ ok: true, merged: H2, detail: `merged into main (${H2.slice(0, 8)}); tests passed` })
  expect(made).toEqual([H1, H2])
  expect(w.calls.some(c => c.startsWith('wt: git ') && / merge --no-edit -m T-1: bring up to date with main/.test(c) && c.endsWith(` ${M1}`))).toBe(true)
  expect(ranTests(w).length).toBe(1)
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

test('checkAndMerge when main moved during the merge leaves main where the other change put it', async () => {
  const w = world({
    // another merge lands on main just before ours tries to move it
    answer: a => {
      if (a[0] === 'update-ref') w.git.main = M2
      return undefined
    },
  })
  const [b, t] = boardWith('auto')
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r).toEqual({ ok: false, detail: 'main moved during the merge; try again' })
  expect(w.git.main).toBe(M2)
})

test('checkAndMerge waits when the owner has main checked out with uncommitted changes', async () => {
  const w = world({ current: 'main', status: ' M README.md\0' })
  const [b, t] = boardWith('auto')
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r).toEqual({ ok: false, detail: blockedText('main', 'T-1', { dirty: ['README.md'], untracked: [] }) })
  expect(r.detail).toBe('you have uncommitted changes on main; commit or stash them, then say "retry T-1"')
  expect(movedMain(w)).toBe(false)
})

test('checkAndMerge waits when an untracked file of the owner would be overwritten by the merge', async () => {
  const w = world({ current: 'main', status: '?? src/a.ts\0?? notes.txt\0' })
  const [b, t] = boardWith('auto')
  const r = await checkAndMerge(w.$, t, WT, b)
  expect(r.ok).toBe(false)
  expect(r.detail).toBe('you have untracked files on main that T-1 would overwrite (src/a.ts); move, rename or commit them, then say "retry T-1"')
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
  expect(r.detail).toBe('you have git-ignored files on main that T-1 would overwrite (src/config.local.json); move or rename them, then say "retry T-1"')
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
  const st = ' M README.md\0?? src/a.ts\0!! secret.env\0!! .symcc/\0?? .symcc/board.json\0!! dist/\0'
  expect(mergeBlockers(st, ['src/a.ts', 'secret.env', '.symcc/board.json'], '.symcc')).toEqual({ dirty: ['README.md'], untracked: ['src/a.ts'], ignored: ['secret.env'] })
})

test('blockedText hides control characters in file names', () => {
  expect(blockedText('main', 'T-1', { dirty: [], untracked: [], ignored: ['a\nb\u001b[31m.txt'] })).toBe('you have git-ignored files on main that T-1 would overwrite (a?b?[31m.txt); move or rename them, then say "retry T-1"')
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

// ---------------- approve and reject ----------------

/** A world where T-1 waits in review: its work is committed (h1) in its worktree and the board is saved. */
async function inReview(g: Partial<Git> = {}, tests: Record<string, Res> = {}, test_commands = ['npm test'], extra: Partial<SymccTask> = {}) {
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
  expect(w.calls).toContain('root: git branch -d symcc/T-1')
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

test('approve that is blocked by the owner\'s uncommitted changes keeps the task in review', async () => {
  const w = await inReview({ current: 'main', status: ' M README.md\0' })
  const out = await runTool(w.$, 'approve', { task: 'T-1' })
  expect(out).toBe('T-1 was not merged and stays in review: you have uncommitted changes on main; commit or stash them, then say "retry T-1". Fix that, then approve it again.')
  const t = find(await load(w.$), 'T-1')!
  expect(t.status).toBe('review')
  expect(t.note).toMatch(/^approved, but not merged: you have uncommitted changes on main/)
  expect(w.git.main).toBe(M1)
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
  expect(w.calls.filter(c => / git /.test(c))).toEqual(['root: git symbolic-ref --short -q HEAD'])
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
  await workerFinished(w.$, 'ag1', 'made the change', false)
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
  await workerFinished(w.$, 'ag1', 'made the change', false)
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
  let b: Board = emptyBoard('main')
  for (const title of ['old done', 'old dropped', 'new done', 'to do']) b = addTask(b, { origin: { why: 'a test' }, title }, ISO)[0]
  b = patchTask(b, 'T-1', { status: 'done', runs: [{ started: LONG_AGO, ended: '2026-01-01T00:10:00.000Z', tokens: 500 }] }, LONG_AGO)
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
  expect(moves).toEqual([`mv -f ${ARCHIVE}.tmp ${ARCHIVE}`, `mv -f ${BOARD}.tmp ${BOARD}`])
  const after = await load(w.$)
  expect(after.tasks.map(t => t.id)).toEqual(['T-3', 'T-4'])
  expect(after.next_id).toBe(b.next_id)
  expect(after.archived).toEqual({ done: 1, dropped: 1, tries: 1, ms: 600_000, tokens: 500 })
  expect(after.archived_done).toEqual(['T-1'])
  expect(JSON.parse(w.files.get(ARCHIVE)!).tasks.map((t: SymccTask) => t.id)).toEqual(['T-1', 'T-2'])
  expect(await runTool(w.$, 'board', {})).toMatch(/archived: 1 done, 1 dropped/)
  expect(await runTool(w.$, 'board', {})).toMatch(/total: 10m · 500 tokens over 1 try/)
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
  expect(b.archived).toEqual({ done: 1, dropped: 0, tries: 1, ms: 600_000, tokens: 500 })
  expect(JSON.parse(w.files.get(ARCHIVE)!).tasks.map((t: SymccTask) => t.id)).toEqual(['T-1'])
  await expect(runTool(w.$, 'board', { task: 'T-9' })).rejects.toThrow(/not on the board or in the archive/)
})

// ---------------- a worker asks the owner ----------------

/** T-1 is "doing" with worker ag1, which then answers `answer`; notify and driving as given. */
async function workerAnswers(answer: string, o: { notify?: 'off' | 'sound' | 'voice'; driving?: boolean } = {}) {
  const w = world()
  const [b0] = boardWith('auto', ['npm test'], { history: ['created by the lead'] })
  await saveBoard(w.$, { ...b0, notify: o.notify ?? 'voice' })
  w.put(`${WT}/.git`, 'gitdir: x')
  S.driving = o.driving ?? true
  sayQueue.splice(0)
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  await workerFinished(w.$, 'ag1', answer, false)
  S.driving = false
  return { w, t: find(await load(w.$), 'T-1')! }
}

test('a worker QUESTION makes the task wait for the owner with the question, not fail', async () => {
  saidNeedsYou.clear()
  const { w, t } = await workerAnswers('I looked around.\nQUESTION: Should the button be red or blue?')
  expect(t.status).toBe('waiting')
  expect(t.question).toBe('Should the button be red or blue?')
  expect(t.note).toBe('waiting for you')
  expect(t.history.at(-1)).toBe('try 1: worker asked: Should the button be red or blue?')
  expect(leadQueue.join('\n')).toContain('T-1 is waiting for the owner: Should the button be red or blue? If you can answer it from what you know, answer with symcc change T-1 (put the answer in the details); otherwise leave it for the owner.')
  expect(movedMain(w)).toBe(false)
  expect(w.calls).not.toContain(`root: git worktree remove --force ${WT}`)
})

test('a worker QUESTION is cut to 1000 characters on the task', async () => {
  const { t } = await workerAnswers(`QUESTION: ${'x'.repeat(1500)}`, { notify: 'off' })
  expect(t.status).toBe('waiting')
  expect(t.question!.length).toBe(1000)
})

test('NEED FILES still makes the task wait with its question', async () => {
  saidNeedsYou.clear()
  const { t } = await workerAnswers('NEED FILES: README.md — the docs mention it')
  expect(t.status).toBe('waiting')
  expect(t.question).toBe('T-1 needs to change files outside its list: README.md — the docs mention it. Allow them?')
  expect(t.note).toBe('waiting for you')
  expect(t.history.at(-1)).toBe('try 1: worker asked for more files: README.md — the docs mention it')
  expect(leadQueue.join('\n')).toContain('The task now waits for the owner, who can allow the files from the board')
  expect((t as { asked_files?: string[] }).asked_files).toEqual(['README.md'])
  expect(sayQueue).toEqual(['?T-1'])
})

test('a worker QUESTION with an OPTIONS line saves the options; without one, or with too few or too many, none', async () => {
  const { t } = await workerAnswers('QUESTION: Which colour?\nOPTIONS: red | blue | green', { notify: 'off' })
  expect(t.question).toBe('Which colour?')
  expect((t as { options?: string[] }).options).toEqual(['red', 'blue', 'green'])
  expect(leadQueue.join('\n')).toContain('Options: red | blue | green.')
  for (const bad of ['QUESTION: Which colour?', 'QUESTION: Which?\nOPTIONS: red', `QUESTION: Which?\nOPTIONS: ${'a b c d e f g'.split(' ').join(' | ')}`])
    expect((await workerAnswers(bad, { notify: 'off' })).t).not.toHaveProperty('options')
})

/** A board where T-1 (files src/) waits after its worker asked for `files` with NEED FILES. */
async function askedForFiles(files: string[]) {
  const w = world()
  const [b] = boardWith('auto')
  await saveBoard(w.$, patchTask(b, 'T-1', { status: 'waiting', question: `T-1 needs to change files outside its list: ${files.join(', ')}. Allow them?`, asked_files: files, note: 'waiting for you' } as Partial<SymccTask>, ISO))
  let saves = 0
  const fs = (w.$ as { fs: { write: (p: string, t: string) => Promise<void> } }).fs
  const write = fs.write
  fs.write = async (p, text) => ((saves += p === `${BOARD}.tmp` ? 1 : 0), write(p, text))
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
  await workerAnswers('QUESTION: which colour?')
  expect(sayQueue).toEqual(['?T-1'])
  expect(spokenLine(sayQueue)).toBe('T-1 needs you')
  // the same question again (same try): not said twice
  await workerAnswers('QUESTION: which colour?')
  expect(sayQueue).toEqual([])
  saidNeedsYou.clear()
  await workerAnswers('QUESTION: which colour?', { notify: 'off' })
  expect(sayQueue).toEqual([])
  await workerAnswers('QUESTION: which colour?', { driving: false })
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
  await saveBoard(w.$, patchTask(b, 'T-1', { status: 'waiting', question: 'NEED FILES: docs/a.md', note: 'waiting for you' }, ISO))
  await runTool(w.$, 'change', { task: 'T-1', answer: 'ok' })
  const t = find(await load(w.$), 'T-1')!
  expect(t.history.at(-1)).toBe('the owner answered: “ok”')
  expect(t.details).toContain('Owner\'s answer to "NEED FILES: docs/a.md": ok')
  expect(t.history.some(l => l.includes('restarted'))).toBe(false)
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

// ---------------- each try's full report ----------------

const REPORT1 = `${ROOT}/.symcc/reports/T-1-try-1.md`

/** T-1 is "doing" (try 1, one run) with worker ag1, which then answers `answer`; the fake git and the task as given. */
async function finishes(answer: string, g: Partial<Git> = {}, extra: Partial<SymccTask> = {}) {
  const w = world(g)
  const [b0] = boardWith('auto', ['npm test'], { history: ['created by the lead'], runs: [{ started: ISO }], ...extra })
  await saveBoard(w.$, b0)
  w.put(`${WT}/.git`, 'gitdir: x')
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
  await workerFinished(w.$, 'ag1', answer, false)
  return { w, t: find(await load(w.$), 'T-1')! }
}

test("a try's full report is saved to .symcc/reports through a temp file, with its path on the run", async () => {
  const long = `I changed src/a.ts.\n\n${'Every word here counts. '.repeat(400)}\nThe end.`
  const { w, t } = await finishes(long)
  expect(t.status).toBe('done')
  expect(t.runs![0]!.report).toBe('.symcc/reports/T-1-try-1.md')
  // kept in full, not cut to the old 600 characters
  expect(w.files.get(REPORT1)).toBe(`${long.trim()}\n`)
  expect(w.files.has(`${REPORT1}.tmp`)).toBe(false)
  expect(w.calls).toContain(`mv -f ${REPORT1}.tmp ${REPORT1}`)
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

test("a QUESTION or NEED FILES try saves its text as the try's report too", async () => {
  const { w, t } = await finishes('I looked around.\nNEED FILES: README.md — the docs mention it')
  expect(t.status).toBe('waiting')
  expect(t.runs![0]!.report).toBe('.symcc/reports/T-1-try-1.md')
  expect(w.files.get(REPORT1)).toContain('NEED FILES: README.md')
})

test('a report that cannot be saved is told once and never blocks the task', async () => {
  // a failing move: the task still goes on; told to the lead only once
  for (const n of [1, 2]) {
    const w = world()
    const [b0] = boardWith('auto', [], { runs: [{ started: ISO }] })
    await saveBoard(w.$, b0)
    const run = w.$ as unknown as { process: { run: (a: string[], o?: object) => Promise<unknown> } }
    const real = run.process.run
    run.process.run = async (a, o) => (a[0] === 'mv' && String(a[2]).includes('/reports/') ? { exitCode: 1, stdout: '', stderr: 'disk full' } : real(a, o))
    leadQueue.splice(0)
    workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: T0 })
    await workerFinished(w.$, 'ag1', 'Done.', false)
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

/** A `$` whose timer runs at once and whose prompts are kept in `sent`. */
function leadWorld() {
  const sent: string[] = []
  const $ = { clock: { after: (_ms: number, f: () => void) => (f(), { cancel() {} }) }, prompt: { submit: async (p: { text: string }) => void sent.push(p.text) } }
  S.leadTimer = null
  S.enabledNow = true
  leadQueue.splice(0)
  meanwhile.splice(0)
  return { $: $ as never, sent }
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
  await saveBoard(w.$, emptyBoard('main'))
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
  const $ = w.$ as unknown as { process: { run: (a: string[], o?: { env?: Record<string, string> }) => Promise<Res> } }
  const real = $.process.run
  $.process.run = async (argv, o = {}) => {
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
  expect(await playsFor(mac.$, 'voice', ['T-3'])).toEqual([{ argv: ['say', '-r', '200', 'T-3 done'] }])
  expect(await playsFor(mac.$, 'sound', ['T-3'])).toEqual([{ argv: ['afplay', '/System/Library/Sounds/Glass.aiff'] }])
  expect(await playsFor(mac.$, 'sound', ['T-3', '?T-5'])).toEqual([{ argv: ['afplay', '/System/Library/Sounds/Ping.aiff'] }])
  expect(await playsFor(mac.$, 'off', ['T-3'])).toEqual([])
  expect(await playsFor(mac.$, 'voice', [evil])).toEqual([{ argv: ['say', '-r', '200', `${evil} done`] }])

  const linux = machine('Linux', ['spd-say', 'espeak', 'paplay', 'canberra-gtk-play'], [`${FD}/complete.oga`, `${FD}/bell.oga`])
  expect((await playsFor(linux.$, 'voice', ['T-3'])).map(p => p.argv)).toEqual([['spd-say', '-w', 'T-3 done'], ['espeak', 'T-3 done']])
  expect((await playsFor(linux.$, 'sound', ['?T-5'])).map(p => p.argv)).toEqual([['paplay', `${FD}/bell.oga`], ['canberra-gtk-play', '-i', 'bell']])
  // none saved: the best this machine has (voice)
  expect((await playsFor(linux.$, null, ['T-3']))[0]!.argv[0]).toBe('spd-say')

  // Windows: the text goes in an environment value the script reads, never into the script
  const win = machine('', ['powershell'])
  const [speak] = await playsFor(win.$, 'voice', [evil])
  expect(speak!.argv.slice(0, 4)).toEqual(['powershell', '-NoProfile', '-NonInteractive', '-Command'])
  expect(speak!.argv[4]).toBe(`Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak($env:${WIN_TEXT_VAR})`)
  expect(speak!.argv.join(' ')).not.toContain('rm -rf')
  expect(speak!.env).toEqual({ [WIN_TEXT_VAR]: `${evil} done` })
  const [chime] = await playsFor(win.$, 'sound', ['T-3'])
  expect(chime!.argv[4]).toContain('[System.Media.SystemSounds]::Asterisk.Play()')
  expect((await playsFor(win.$, 'sound', ['?T-3']))[0]!.argv[4]).toContain('Exclamation')
})

test('only the driving session plays, lines are joined, and the first command that works is the last one tried', async () => {
  const m = machine('Linux', ['spd-say', 'espeak'])
  const b = { ...emptyBoard('main'), notify: 'voice' as const }
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
  expect(played.map(r => r.argv)).toEqual([['spd-say', '-w', 'T-3 and T-4 done']])
})

test("a saved notify this machine can't play is told once, plays nothing, and the setting is kept", async () => {
  const m = machine('Linux', ['paplay'], [`${FD}/complete.oga`])
  await saveBoard(m.$, { ...emptyBoard('main'), notify: 'voice' })
  expect(await playsFor(m.$, 'voice', ['T-3'])).toEqual([])
  expect(await playsFor(m.$, 'voice', ['T-4'])).toEqual([])
  const notes = m.toasts.filter(t => t.includes('nothing will play'))
  expect(notes).toEqual([JSON.stringify("symcc: notify is 'voice' but no speech program was found here; nothing will play")])
  expect((await load(m.$)).notify).toBe('voice')
})

test("notify can't be set to a choice this machine can't play: the owner and the lead are told why", async () => {
  const m = machine('Linux', ['paplay'], [`${FD}/complete.oga`])
  await saveBoard(m.$, { ...emptyBoard('main'), notify: 'off' })
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
async function tryEnds(then: (w: ReturnType<typeof world>) => Promise<unknown>, o: { g?: Partial<Git>; tests?: Record<string, Res>; extra?: Partial<SymccTask> } = {}) {
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
const answers = (answer: string, aborted = false) => (w: ReturnType<typeof world>) => workerFinished(w.$, 'ag1', answer, aborted)

test('a finished try ends with the outcome of its check', async () => {
  const merged = await tryEnds(answers('made the change'))
  expect(merged.end).toEqual(['finished', 'merged'])
  expect(merged.r.ended).toBeDefined()
  expect((await tryEnds(answers('made the change'), { extra: { needs_review: true } })).end).toEqual(['finished', 'ready for review'])
  expect((await tryEnds(answers('made the change'), { tests: { 'npm test': { exitCode: 1, stdout: 'FAIL', stderr: '' } } })).end).toEqual(['finished', 'tests failed'])
  expect((await tryEnds(answers('made the change'), { g: { upToDate: false, conflict: true } })).end).toEqual(['finished', 'clash with main'])
  expect((await tryEnds(answers('made the change'), { g: { changed: ['README.md'] } })).end).toEqual(['finished', 'out of scope'])
})

test('a try that asks ends as asked: QUESTION or NEED FILES; one stopped from Claude Code as stopped', async () => {
  expect((await tryEnds(answers('QUESTION: red or blue?'))).end).toEqual(['asked', 'QUESTION'])
  expect((await tryEnds(answers('NEED FILES: README.md — docs'))).end).toEqual(['asked', 'NEED FILES'])
  expect((await tryEnds(answers('', true))).end).toEqual(['stopped', 'stopped from Claude Code'])
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
    await workerFinished(w.$, 'ag1', 'made the change', false)
  })
  expect(paused.t.status).toBe('paused')
  expect(paused.end).toEqual(['stopped', 'paused'])
})

test('a try that ran over max_minutes ends as timed out', async () => {
  try {
    const over = await tryEnds(async w => {
      S.driving = true // world() sets it to false
      workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: -1e13 })
      await check(w.$)
    })
    expect(over.t.status).toBe('failed')
    expect(over.end[0]).toBe('timed out')
    expect(over.end[1]).toMatch(/^ran over \d+ min$/)
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
