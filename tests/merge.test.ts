import { expect, test } from 'claude-code/testing'
import type { SymccTask } from '../types'
import { type Board, addTask, emptyBoard, patchTask, lockText, parseBoard, outOfScopeText, blockedText, mergeBlockers, find, onConflict, spokenLine, statText, REPORT_MAX_CHARS } from '../hooks/board'
import { checkAndMerge, changedFiles, changesText } from '../hooks/plugin/review'
import { removeWorktree } from '../hooks/plugin/git'
import { S, leadQueue, workers, sayQueue } from '../hooks/plugin/state'
import { saidNeedsYou } from '../hooks/plugin/voice'
import { workerFinished } from '../hooks/plugin/workers'
import { change, load, saveBoard, takeLock, dropLock } from '../hooks/plugin/store'
import { runTool } from '../hooks/plugin/tools'

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

// ---------------- a worker asks the owner ----------------

/** T-1 is "doing" with worker ag1, which then answers `answer`; voice and driving as given. */
async function workerAnswers(answer: string, o: { voice?: boolean; driving?: boolean } = {}) {
  const w = world()
  const [b0] = boardWith('auto', ['npm test'], { history: ['created by the lead'] })
  await saveBoard(w.$, { ...b0, voice: o.voice ?? true })
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
  const { t } = await workerAnswers(`QUESTION: ${'x'.repeat(1500)}`, { voice: false })
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
  expect(leadQueue.join('\n')).toContain('The task now waits for the owner.')
  expect(sayQueue).toEqual(['?T-1'])
})

test('"T-1 needs you" is queued once per waiting question with voice on, and not with voice off or in another session', async () => {
  saidNeedsYou.clear()
  await workerAnswers('QUESTION: which colour?')
  expect(sayQueue).toEqual(['?T-1'])
  expect(spokenLine(sayQueue)).toBe('T-1 needs you')
  // the same question again (same try): not said twice
  await workerAnswers('QUESTION: which colour?')
  expect(sayQueue).toEqual([])
  saidNeedsYou.clear()
  await workerAnswers('QUESTION: which colour?', { voice: false })
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
