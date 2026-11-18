// setupGit end to end (T-208): git init (and its fallback for an old git), the .gitignore it writes or
// extends (also when the repo's top folder is above the project folder), the risky files it leaves out of
// the first commit, the commit itself, and the open tasks' merge_into. The test runtime can't run a real
// git, so a small fake git below keeps a repo's state (is there a repo, HEAD, the index, the commits) and
// answers the commands setupGit runs; the files live in memory.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { type Board, addTask, emptyBoard, patchTask, BIG_FILE_BYTES } from '../hooks/board'
import { setupGit } from '../hooks/app/git'
import { S, leadQueue, meanwhile } from '../hooks/app/state'
import { load, saveBoard } from '../hooks/app/store'
import { fakeHost, memoryFs } from './fake-host'

const ROOT = '/repo'
const ISO = '2026-11-13T00:00:00.000Z'

type Res = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Res => ({ exitCode: 0, stdout, stderr: '' })
const fail = (stderr = '', exitCode = 1): Res => ({ exitCode, stdout: '', stderr })

/** What the fake repo looks like before setup. */
type Start = {
  /** the git program is there */
  hasGit?: boolean
  /** a repo exists already (at `top`) */
  repo?: boolean
  /** the repo's top folder (default: the project folder) */
  top?: string
  /** the branch HEAD points at in an existing repo */
  head?: string
  /** a commit exists already */
  hasCommit?: boolean
  /** an old git: `init -b` fails */
  oldGit?: boolean
  /** the commit fails */
  commitFails?: boolean
  /** where the project folder is (default ROOT) */
  root?: string
}

type Commit = { files: string[]; args: string[] }

/** A gitignore line matches a path (the few patterns setup writes: dir/, /exact, name, name.*, !.env*.example). As in git, the last matching line wins; case-sensitive, like git on Linux. */
function ignored(lines: string[], path: string): boolean {
  const parts = path.split('/')
  const base = parts.at(-1)!
  const matches = (l: string) => {
    if (l.startsWith('/')) return path === l.slice(1).replace(/\\(.)/g, '$1')
    if (l.endsWith('/')) {
      const d = l.slice(0, -1)
      // "a/b/" from the top, or "name/" at any depth
      if (d.includes('/')) return path.startsWith(`${d}/`)
      return parts.slice(0, -1).includes(d)
    }
    if (l.includes('*')) return new RegExp('^' + l.split('*').map(x => x.replace(/[.+?^$()|[\]{}\\]/g, '\\$&')).join('[^/]*') + '$').test(base)
    return base === l
  }
  let out = false
  for (const raw of lines) {
    const l = raw.trim()
    if (!l || l.startsWith('#')) continue
    if (l.startsWith('!')) { if (matches(l.slice(1))) out = false }
    else if (matches(l)) out = true
  }
  return out
}

/** Files in memory, a fake git keeping a repo's state, and a `$` for the plugin code. */
function world(start: Start = {}) {
  const root = start.root ?? ROOT
  const top = start.top ?? root
  const files = new Map<string, string>()
  // a size other than the text's length (a big file without a big string)
  const sizes = new Map<string, number>()
  const calls: string[] = []
  const repo = { exists: !!start.repo, head: start.repo ? (start.head ?? 'main') : '', inits: 0, index: new Set<string>(), commits: [] as Commit[] }
  if (start.hasCommit) repo.commits.push({ files: [], args: [] })

  const rel = (p: string) => p.slice(top.length + 1)
  const work = () => [...files.keys()].filter(p => p.startsWith(`${top}/`)).map(rel)
  const ignoreLines = () => (files.get(`${top}/.gitignore`) ?? '').split(/\r?\n/)

  function runGit(args: string[]): Res {
    const a = args.filter((x, i) => x !== '-c' && args[i - 1] !== '-c')
    const s = a.join(' ')
    if (s === '--version') return start.hasGit === false ? fail('command not found', 127) : ok('git version 2.50.0')
    if (a[0] === 'init') {
      if (a.includes('-b') && start.oldGit) return fail("error: unknown switch `b'", 129)
      repo.exists = true
      repo.inits++
      repo.head = a.includes('-b') ? a[a.indexOf('-b') + 1]! : 'master'
      return ok()
    }
    if (!repo.exists) return fail('fatal: not a git repository', 128)
    if (s === 'rev-parse --is-inside-work-tree') return ok('true\n')
    if (s === 'rev-parse --verify -q HEAD') return repo.commits.length ? ok('a'.repeat(40)) : fail()
    if (s === 'symbolic-ref HEAD refs/heads/main') return (repo.head = 'main'), ok()
    if (s === 'symbolic-ref --short -q HEAD') return repo.head ? ok(`${repo.head}\n`) : fail()
    if (s === 'rev-parse --show-toplevel') return ok(`${top}\n`)
    if (s === 'add -A') {
      const lines = ignoreLines()
      repo.index = new Set(work().filter(p => !ignored(lines, p)))
      return ok()
    }
    if (s === 'write-tree') return ok('t'.repeat(40))
    if (a[0] === 'ls-tree') {
      const out = [...repo.index].map(p => `100644 blob ${'b'.repeat(40)} ${String(sizes.get(`${top}/${p}`) ?? files.get(`${top}/${p}`)!.length).padStart(7)}\t${p}`)
      return ok(out.map(x => `${x}\0`).join(''))
    }
    if (a[0] === 'rm' && a.includes('--cached')) {
      for (const p of a.slice(a.indexOf('--') + 1)) repo.index.delete(p)
      return ok()
    }
    if (a[0] === 'add' && a[1] === '--') {
      for (const p of a.slice(2)) repo.index.add(p)
      return ok()
    }
    if (s === 'ls-files --cached') return ok([...repo.index].join('\n') + '\n')
    if (a[0] === 'commit') {
      if (start.commitFails) return fail('fatal: unable to write commit')
      repo.commits.push({ files: [...repo.index].sort(), args })
      return ok()
    }
    // homeBranch (for publish): no origin, the local branches
    if (a[0] === 'for-each-ref') return ok(repo.commits.length ? `${repo.head}\n` : '')
    return ok()
  }

  const { host: $ } = fakeHost({
    run: async (argv: readonly string[], o: { cwd?: string } = {}): Promise<Res> => {
      const [cmd, ...rest] = argv
      if (cmd === 'git') {
        calls.push(`${o.cwd ?? root}: git ${rest.join(' ')}`)
        return runGit(rest)
      }
      calls.push(argv.join(' '))
      // the board's lock and its save through a temp file (see store.ts)
      if (cmd === 'ln') {
        if (files.has(rest[1]!)) return fail('File exists')
        files.set(rest[1]!, files.get(rest[0]!)!)
        return ok()
      }
      if (cmd === 'mv') {
        const [, from, to] = rest
        if (!files.has(from!)) return fail('No such file')
        files.set(to!, files.get(from!)!)
        files.delete(from!)
        return ok()
      }
      if (cmd === 'rm') {
        for (const p of rest.filter(x => !x.startsWith('-'))) files.delete(p)
        return ok()
      }
      // nothing else is installed (no sound players)
      return fail('not found', 127)
    },
    fs: memoryFs(files),
    ui: { toast: () => undefined, status: () => undefined },
    clock: { after: () => ({ cancel() {} }), sleep: async () => undefined },
  })
  S.root = root
  S.leadTimer = null
  S.writing = Promise.resolve()
  S.driving = false
  S.startupDone = false
  S.enabledNow = true
  S.settingUp = false
  S.gitState = start.repo ? 'no-commits' : 'no-repo'
  S.toldGit = S.gitState
  leadQueue.splice(0)
  meanwhile.splice(0)
  const gitCalls = (what: string) => calls.filter(c => c.includes(`: git ${what}`))
  return { $, files, sizes, calls, gitCalls, repo, root, top }
}

/** The project's normal files, and an empty board. */
async function withProject(w: ReturnType<typeof world>, b: Board = emptyBoard()) {
  w.files.set(`${w.root}/README.md`, '# hi\n')
  w.files.set(`${w.root}/src/a.ts`, 'export const a = 1\n')
  await saveBoard(w.$, b)
}

const ignoreOf = (w: ReturnType<typeof world>) => w.files.get(`${w.top}/.gitignore`) ?? ''
const ignoreLinesOf = (w: ReturnType<typeof world>) => ignoreOf(w).split('\n').filter(Boolean)

// ---------------- (a) no repo ----------------

test('a folder with no repo: git init on main, once', async () => {
  const w = world()
  await withProject(w)
  await setupGit(w.$, 'the lead')
  expect(w.gitCalls('init')).toEqual([`${ROOT}: git init -q -b main`])
  expect(w.repo.head).toBe('main')
})

test('a folder with no repo: a .gitignore with symcc data folder and the common safe lines', async () => {
  const w = world()
  await withProject(w)
  await setupGit(w.$, 'the lead')
  expect(ignoreLinesOf(w)).toEqual([`${S.N.dir}/`, 'node_modules/', '.env', '.env.*', '!.env*.example', '!.env*.sample', '!.env*.template', '!.env*.dist', '!.env*.defaults', '.DS_Store', 'dist/', 'build/', '__pycache__/', '.venv/'])
})

test('a folder with no repo: one commit with the normal files and .gitignore, not the data folder', async () => {
  const w = world()
  await withProject(w)
  await setupGit(w.$, 'the lead')
  expect(w.repo.commits.map(c => c.files)).toEqual([['.gitignore', 'README.md', 'src/a.ts']])
})

test('the first commit skips hooks (--no-verify) and is by symcc', async () => {
  const w = world()
  await withProject(w)
  await setupGit(w.$, 'the lead')
  const args = w.repo.commits[0]!.args
  expect(args).toContain('--no-verify')
  expect(args).toContain(`user.name=${S.N.author.name}`)
  expect(args).toContain(`Initial commit (by ${S.N.name})`)
})

test('a folder with no repo: the answer says a repo was made, a .gitignore written and 3 files committed on main', async () => {
  const w = world()
  await withProject(w)
  const out = await setupGit(w.$, 'the lead')
  expect(out).toContain('made a git repo')
  expect(out).toContain('wrote a .gitignore')
  expect(out).toContain('committed 3 files on main')
  expect(out).not.toContain('Warning')
})

test('after setup, git counts as ready and setup can run again without doing anything', async () => {
  const w = world()
  await withProject(w)
  await setupGit(w.$, 'the lead')
  expect(S.gitState).toBe('ok')
  expect(S.settingUp).toBe(false)
  const again = await setupGit(w.$, 'the lead')
  expect(again).toContain('set up already')
  expect(w.repo.commits.length).toBe(1)
  expect(w.gitCalls('init').length).toBe(1)
})

test('an old git without init -b: plain init, then HEAD is pointed at main', async () => {
  const w = world({ oldGit: true })
  await withProject(w)
  const out = await setupGit(w.$, 'the lead')
  expect(w.gitCalls('init')).toEqual([`${ROOT}: git init -q -b main`, `${ROOT}: git init -q`])
  expect(w.gitCalls('symbolic-ref HEAD')).toEqual([`${ROOT}: git symbolic-ref HEAD refs/heads/main`])
  expect(out).toContain('on main')
})

// ---------------- (b) a repo with no commits ----------------

test('an existing repo with no commits: no second git init', async () => {
  const w = world({ repo: true })
  await withProject(w)
  await setupGit(w.$, 'the lead')
  expect(w.gitCalls('init')).toEqual([])
})

test('an existing repo with no commits: a .gitignore and one commit with the normal files', async () => {
  const w = world({ repo: true })
  await withProject(w)
  const out = await setupGit(w.$, 'the lead')
  expect(ignoreLinesOf(w)[0]).toBe(`${S.N.dir}/`)
  expect(w.repo.commits.map(c => c.files)).toEqual([['.gitignore', 'README.md', 'src/a.ts']])
  expect(out).not.toContain('made a git repo')
})

test('an existing repo whose HEAD points at another branch: the commit lands there and the answer names it', async () => {
  const w = world({ repo: true, head: 'trunk' })
  await withProject(w)
  const out = await setupGit(w.$, 'the lead')
  expect(w.repo.head).toBe('trunk')
  expect(out).toContain('on trunk')
})

test("the repo's top above the project folder: .gitignore at the top, with the data folder under the project's path", async () => {
  const w = world({ repo: true, root: '/top/app', top: '/top' })
  await withProject(w)
  w.files.set('/top/other.txt', 'x\n')
  await setupGit(w.$, 'the lead')
  expect(w.files.has('/top/app/.gitignore')).toBe(false)
  expect(ignoreLinesOf(w)[0]).toBe(`app/${S.N.dir}/`)
  expect(w.repo.commits[0]!.files).toEqual(['.gitignore', 'app/README.md', 'app/src/a.ts', 'other.txt'])
})

test("the repo's top above the project folder: git add and commit run at the top", async () => {
  const w = world({ repo: true, root: '/top/app', top: '/top' })
  await withProject(w)
  await setupGit(w.$, 'the lead')
  expect(w.gitCalls('add -A')).toEqual(['/top: git add -A'])
  expect(w.calls.filter(c => c.includes(' commit ')).every(c => c.startsWith('/top: '))).toBe(true)
})

// ---------------- (c) risky files ----------------

test('a .env file is not in the commit and is covered by .gitignore', async () => {
  const w = world()
  await withProject(w)
  w.files.set(`${ROOT}/.env`, 'TOKEN=secret\n')
  await setupGit(w.$, 'the lead')
  expect(w.repo.commits[0]!.files).not.toContain('.env')
  expect(ignoreLinesOf(w)).toContain('.env')
})

test('a .env file in a sub folder is not in the commit either', async () => {
  const w = world()
  await withProject(w)
  w.files.set(`${ROOT}/config/.env.local`, 'TOKEN=secret\n')
  await setupGit(w.$, 'the lead')
  expect(w.repo.commits[0]!.files).not.toContain('config/.env.local')
})

test('template files (.env.example, config/.env.defaults, id_rsa.example) are in the first commit; .env next to them is not', async () => {
  const w = world()
  await withProject(w)
  for (const f of ['.env', '.env.example', 'config/.env.defaults', 'keys/id_rsa.example']) w.files.set(`${ROOT}/${f}`, 'X=1\n')
  const out = await setupGit(w.$, 'the lead')
  const files = w.repo.commits[0]!.files
  for (const f of ['.env.example', 'config/.env.defaults', 'keys/id_rsa.example']) expect(files).toContain(f)
  expect(files).not.toContain('.env')
  expect(out).not.toContain('looks like a secret')
})

test('longer template names (.env.local.example, config/.env.production.sample) are in the first commit too; .env.EXAMPLE and .env.local are not', async () => {
  const w = world()
  await withProject(w)
  for (const f of ['.env.local', '.env.local.example', 'config/.env.production.sample', '.env.EXAMPLE']) w.files.set(`${ROOT}/${f}`, 'X=1\n')
  await setupGit(w.$, 'the lead')
  const files = w.repo.commits[0]!.files
  for (const f of ['.env.local.example', 'config/.env.production.sample']) expect(files).toContain(f)
  for (const f of ['.env.local', '.env.EXAMPLE']) expect(files).not.toContain(f)
})

test("a template the owner's own .gitignore ignores on purpose (.env.sample) stays out: setup adds no !.env*.sample line after it", async () => {
  const w = world()
  await withProject(w)
  w.files.set(`${w.top}/.gitignore`, '.env.sample\n')
  for (const f of ['.env.sample', '.env.example']) w.files.set(`${ROOT}/${f}`, 'REAL=1\n')
  await setupGit(w.$, 'the lead')
  const lines = ignoreLinesOf(w)
  expect(lines).not.toContain('!.env*.sample')
  expect(lines).toContain('!.env*.example')
  const files = w.repo.commits[0]!.files
  expect(files).not.toContain('.env.sample')
  expect(files).toContain('.env.example')
})

test('a secret-looking file the base lines miss (a .pem) is taken out of the commit and added to .gitignore by its path', async () => {
  const w = world()
  await withProject(w)
  w.files.set(`${ROOT}/certs/server.pem`, '-----BEGIN PRIVATE KEY-----\n')
  const out = await setupGit(w.$, 'the lead')
  expect(w.repo.commits[0]!.files).toEqual(['.gitignore', 'README.md', 'src/a.ts'])
  expect(ignoreLinesOf(w)).toContain('/certs/server.pem')
  expect(out).toContain('certs/server.pem (looks like a secret)')
})

test('a file over 50 MB is taken out of the commit and added to .gitignore by its path', async () => {
  const w = world()
  await withProject(w)
  w.files.set(`${ROOT}/data/big.bin`, 'x')
  w.sizes.set(`${ROOT}/data/big.bin`, BIG_FILE_BYTES + 1)
  const out = await setupGit(w.$, 'the lead')
  expect(w.repo.commits[0]!.files).toEqual(['.gitignore', 'README.md', 'src/a.ts'])
  expect(ignoreLinesOf(w)).toContain('/data/big.bin')
  expect(out).toContain('Warning: left out of the commit and added to .gitignore: data/big.bin')
})

test('a file of exactly 50 MB stays in the commit', async () => {
  const w = world()
  await withProject(w)
  w.files.set(`${ROOT}/data/edge.bin`, 'x')
  w.sizes.set(`${ROOT}/data/edge.bin`, BIG_FILE_BYTES)
  await setupGit(w.$, 'the lead')
  expect(w.repo.commits[0]!.files).toContain('data/edge.bin')
  expect(ignoreLinesOf(w)).not.toContain('/data/edge.bin')
})

test('the .gitignore committed is the one with the left-out files in it', async () => {
  const w = world()
  await withProject(w)
  w.files.set(`${ROOT}/id_rsa`, 'key\n')
  await setupGit(w.$, 'the lead')
  // after taking a file out, .gitignore is staged again
  expect(w.gitCalls('add -- .gitignore')).toEqual([`${ROOT}: git add -- .gitignore`])
  expect(w.repo.commits[0]!.files).toContain('.gitignore')
})

test('more than 100 risky files are taken out in batches of at most 100', async () => {
  const w = world()
  await withProject(w)
  for (let i = 0; i < 150; i++) w.files.set(`${ROOT}/keys/k${i}.key`, 'key\n')
  await setupGit(w.$, 'the lead')
  const rms = w.gitCalls('rm -q --cached')
  expect(rms.length).toBe(2)
  expect(w.repo.commits[0]!.files).toEqual(['.gitignore', 'README.md', 'src/a.ts'])
})

// ---------------- (d) an existing .gitignore ----------------

test("an existing .gitignore keeps its own lines first, symcc's missing lines are added after them", async () => {
  const w = world()
  await withProject(w)
  w.files.set(`${ROOT}/.gitignore`, '# mine\n*.log\nnode_modules\n')
  const out = await setupGit(w.$, 'the lead')
  const lines = ignoreLinesOf(w)
  expect(lines.slice(0, 3)).toEqual(['# mine', '*.log', 'node_modules'])
  expect(lines).toContain(`${S.N.dir}/`)
  // node_modules was there already (without the slash): not added twice
  expect(lines.filter(l => l.startsWith('node_modules')).length).toBe(1)
  expect(out).toContain('added lines to .gitignore')
})

test('an existing .gitignore without a last newline gets one before the added lines', async () => {
  const w = world()
  await withProject(w)
  w.files.set(`${ROOT}/.gitignore`, '*.log')
  await setupGit(w.$, 'the lead')
  expect(ignoreOf(w).startsWith('*.log\n')).toBe(true)
})

test('an existing .gitignore that has every line already is not rewritten and the answer says nothing about it', async () => {
  const w = world()
  await withProject(w)
  const mine = `${[`${S.N.dir}/`, 'node_modules/', '.env', '.env.*', '!.env*.example', '!.env*.sample', '!.env*.template', '!.env*.dist', '!.env*.defaults', '.DS_Store', 'dist/', 'build/', '__pycache__/', '.venv/'].join('\n')}\n`
  w.files.set(`${ROOT}/.gitignore`, mine)
  const out = await setupGit(w.$, 'the lead')
  expect(ignoreOf(w)).toBe(mine)
  expect(out).not.toContain('.gitignore')
})

// ---------------- (e) the open tasks ----------------

function boardWithTasks(): Board {
  let b = emptyBoard()
  for (const title of ['Todo', 'Doing', 'Failed', 'Done', 'Dropped']) b = addTask(b, { origin: { why: 'a test' }, title, merge_into: 'guess' }, ISO)[0]
  b = patchTask(b, 'T-2', { status: 'doing' }, ISO)
  b = patchTask(b, 'T-3', { status: 'failed' }, ISO)
  b = patchTask(b, 'T-4', { status: 'done' }, ISO)
  return patchTask(b, 'T-5', { status: 'dropped' }, ISO)
}

test('open tasks get merge_into set to the new branch', async () => {
  const w = world()
  await withProject(w, boardWithTasks())
  await setupGit(w.$, 'the lead')
  const b = await load(w.$)
  expect(['T-1', 'T-2', 'T-3'].map(id => b.tasks.find(t => t.id === id)!.merge_into)).toEqual(['main', 'main', 'main'])
})

test('done and dropped tasks keep their merge_into', async () => {
  const w = world()
  await withProject(w, boardWithTasks())
  await setupGit(w.$, 'the lead')
  const b = await load(w.$)
  expect(['T-4', 'T-5'].map(id => b.tasks.find(t => t.id === id)!.merge_into)).toEqual(['guess', 'guess'])
})

test('open tasks get the branch HEAD points at in an existing repo, not main', async () => {
  const w = world({ repo: true, head: 'trunk' })
  await withProject(w, boardWithTasks())
  await setupGit(w.$, 'the lead')
  expect((await load(w.$)).tasks.find(t => t.id === 'T-1')!.merge_into).toBe('trunk')
})

// ---------------- when not to set up, and failures ----------------

test('a repo with commits already: nothing is done', async () => {
  const w = world({ repo: true, hasCommit: true })
  await withProject(w)
  const out = await setupGit(w.$, 'the lead')
  expect(out).toContain('set up already')
  expect(w.files.has(`${ROOT}/.gitignore`)).toBe(false)
  expect(w.repo.commits.length).toBe(1)
})

test('no git program: the answer says how to install it and nothing is made', async () => {
  const w = world({ hasGit: false })
  await withProject(w)
  const out = await setupGit(w.$, 'the lead')
  expect(out).toContain('git is not installed')
  expect(w.gitCalls('init')).toEqual([])
  expect(w.files.has(`${ROOT}/.gitignore`)).toBe(false)
})

test('a setup already running: a second one is refused', async () => {
  const w = world()
  await withProject(w)
  S.settingUp = true
  expect(await setupGit(w.$, 'the lead')).toBe('git is being set up already')
  expect(w.gitCalls('init')).toEqual([])
})

test('a failed commit: setup throws, the tasks keep their merge_into and setup can be tried again', async () => {
  const w = world({ commitFails: true })
  await withProject(w, boardWithTasks())
  let err = ''
  await setupGit(w.$, 'the lead').catch((e: Error) => (err = e.message))
  expect(err).toContain('unable to write commit')
  expect(S.settingUp).toBe(false)
  expect(S.gitState).not.toBe('ok')
  expect((await load(w.$)).tasks.find(t => t.id === 'T-1')!.merge_into).toBe('guess')
})

test('the owner setting it up (not the lead): the lead is told what was done', async () => {
  const w = world()
  await withProject(w)
  await setupGit(w.$, 'the owner')
  expect(meanwhile.some(x => x.startsWith('The owner set up git:'))).toBe(true)
})
