// T-1053: a worker may change git in its own folder and on its own branch (commit, merge another branch...). These
// tests run symcc's own path over a worker's commits and merge commits on real git, through the Node CLI with the fake
// `claude -p` (fake-claude.sh, its FAKE_GIT line): the prep step, the "no change" check, the scope check, the try's
// commit list, bringing the branch up to date with main, the merge into main, a retry from the kept branch, and the
// doctor's branch cleanup.
import { test, expect } from 'bun:test'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { runCommand, PLUGIN_ROOT } from '../host'
import { joinedText, partsFilesNamed } from '../../../hooks/core/board-parts'
import { isTaskCommit } from '../../../hooks/core/commits'
import { openSession, closeSession } from '../session'
import { claudeRunner } from '../../../hooks/process/claude-runner'
import { nodeProcessSystem } from '../system'
import { readTaskBranch } from '../../../hooks/app/branches'

const MAIN = `${PLUGIN_ROOT}/hosts/node/main.ts`
const FAKE = `${PLUGIN_ROOT}/hosts/node/tests/fake-claude.sh`
/** The worker's own git, as the fake runs it (FAKE_GIT): with a name and email, since the scratch repo has none. */
const W = 'git -c user.name=w -c user.email=w@w'

/** A scratch repo on main with `files` committed, a branch `side` that adds `sideFile`, and symcc set up in it. */
async function scratchRepo(name: string, sideFile: string, check: string) {
  const repo = await mkdtemp(`/tmp/symcc-node-${name}-`)
  const git = (...args: string[]) => runCommand(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo })
  await git('init', '-q', '-b', 'main')
  await writeFile(`${repo}/.gitignore`, '.symcc/\n')
  await writeFile(`${repo}/check.sh`, check)
  await git('add', '.')
  await git('commit', '-qm', 'init')
  await git('checkout', '-q', '-b', 'side')
  await writeFile(`${repo}/${sideFile}`, 'from the side branch\n')
  await git('add', '.')
  await git('commit', '-qm', 'side: add a file')
  await git('checkout', '-q', 'main')
  await runCommand(['bun', MAIN, '--root', repo, '--claude', FAKE, 'cmd', 'symcc-init'], { cwd: repo, timeoutMs: 120_000 })
  const cli = (env: Record<string, string>, ...args: string[]) => runCommand(['bun', MAIN, '--root', repo, '--claude', FAKE, ...args], { cwd: repo, env, timeoutMs: 240_000 })
  expect((await cli({}, 'tool', 'settings', JSON.stringify({ test_commands: ['sh check.sh'] }))).stdout).toContain('sh check.sh')
  const sha = async (ref: string) => (await git('rev-parse', '-q', '--verify', ref)).stdout.trim()
  /** Task `id` as the board has it, its parts file (done tasks) joined back. */
  const task = async (id: string) => {
    const saved = await readFile(`${repo}/.symcc/board.json`, 'utf8')
    const parts = new Map<string, string | null>()
    for (const rel of partsFilesNamed(JSON.parse(saved))) parts.set(rel, await readFile(`${repo}/.symcc/${rel}`, 'utf8').catch(() => null))
    return JSON.parse(joinedText(saved, rel => parts.get(rel) ?? null)).tasks.find((t: { id: string }) => t.id === id)
  }
  /** The commits task `t`'s runs saved. */
  const saved = (t: { runs?: { commits?: string[] }[] }) => (t.runs ?? []).flatMap(r => r.commits ?? [])
  return { repo, git, cli, sha, task, saved }
}

test('T-1053: a worker\'s own commit and its merge of another branch pass prep, the scope check, the catch-up and the merge; the try\'s commits list them', async () => {
  const r = await scratchRepo('wgit', 'side.txt', 'test -f side.txt && test -f hello.txt\n')
  try {
    expect((await r.cli({}, 'add', 'Hello and side', 'Write hello.txt and bring in side', '--files', 'hello.txt,side.txt')).stdout).toContain('added T-1')
    // the worker commits its edit and merges `side`, leaving nothing uncommitted; meanwhile the owner commits on main,
    // so the merge step must bring the branch up to date first
    const fakeGit = `git add -A && ${W} commit -qm "worker: hello" && ${W} merge -q --no-ff --no-edit side && git -C "$FAKE_REPO" -c user.name=o -c user.email=o@o commit -q --allow-empty -m "owner: main moved"`
    const tick = await r.cli({ FAKE_GIT: fakeGit, FAKE_REPO: r.repo }, 'tick')
    expect(tick.stdout).toMatch(/T-1 "Hello and side" merged into main/)
    // main has the worker's file, the merged-in file and the owner's commit
    expect((await r.git('show', 'main:hello.txt')).stdout).toBe('hello from the fake worker\n')
    expect((await r.git('show', 'main:side.txt')).stdout).toBe('from the side branch\n')
    const log = (await r.git('log', '--format=%s', 'main')).stdout
    for (const s of ['worker: hello', 'owner: main moved', 'side: add a file', 'T-1: bring up to date with main']) expect(log).toContain(s)
    // main's tip is a commit of symcc's for this try (so a reload finds the try merged, alreadyMerged), not the worker's
    expect(isTaskCommit((await r.git('log', '-1', '--format=%B', 'main')).stdout, 'T-1', 'symcc', 1)).toBe(true)
    const t = await r.task('T-1')
    expect(t.status).toBe('done')
    expect(t.merged).toBe(await r.sha('main'))
    // the try's commit list has the worker's own commit and merge commit too
    const worker = (await r.git('log', '--format=%H', '--grep=^worker: hello', 'main')).stdout.trim()
    const merge = (await r.git('log', '--format=%H', '--merges', '--grep=side', 'main')).stdout.trim()
    expect(worker).toMatch(/^[0-9a-f]{40}$/)
    expect(merge).toMatch(/^[0-9a-f]{40}$/)
    expect(r.saved(t)).toContain(worker)
    expect(r.saved(t)).toContain(merge)
    // the doctor finds no unmerged work on the task's branch (it is merged, or already cleaned up)
    expect((await r.cli({}, 'cmd', 'symcc-doctor')).stdout).not.toContain('holds unmerged work')
    // the task page's branch: the worker's commits are among the task's commits, and the fork is main's first commit
    const s = await openSession({ root: r.repo, runner: claudeRunner(nodeProcessSystem, { bin: FAKE }), say: () => undefined, sessionId: 'node-t1053' })
    try {
      const facts = await readTaskBranch(s.host, t, 'main', Date.now())
      const shas = (facts?.commits ?? []).map(c => c.sha)
      expect(shas).toContain(worker)
      expect(shas).toContain(merge)
      expect(facts?.fork?.sha).toBe((await r.git('rev-list', '--max-parents=0', 'main')).stdout.trim())
    } finally {
      await closeSession(s).catch(() => undefined)
    }
  } finally {
    await rm(r.repo, { recursive: true, force: true })
  }
}, 600_000)

test('T-1053: a try whose only change is the worker\'s merge commit is merged, not "the worker made no change"', async () => {
  const r = await scratchRepo('wmerge', 'side.txt', 'test -f side.txt\n')
  try {
    expect((await r.cli({}, 'add', 'Bring in side', 'Merge the side branch', '--files', 'side.txt')).stdout).toContain('added T-1')
    // the fake's own edit goes to .scratch/ (never committed), so the merge commit is the try's only change
    const tick = await r.cli({ FAKE_EDIT: '.scratch/note.txt', FAKE_GIT: `${W} merge -q --no-ff --no-edit side` }, 'tick')
    expect(tick.stdout).toMatch(/T-1 "Bring in side" merged into main/)
    expect((await r.git('show', 'main:side.txt')).stdout).toBe('from the side branch\n')
    expect(isTaskCommit((await r.git('log', '-1', '--format=%B', 'main')).stdout, 'T-1', 'symcc', 1)).toBe(true)
    expect((await r.task('T-1')).status).toBe('done')
  } finally {
    await rm(r.repo, { recursive: true, force: true })
  }
}, 600_000)

test('T-1053: a secret-looking file the worker added in its own merge commit, then deleted, never reaches main\'s history', async () => {
  const r = await scratchRepo('wsecret', 'side.txt', 'test -f side.txt\n')
  try {
    expect((await r.cli({}, 'add', 'Hello and side', 'Write hello.txt and bring in side', '--files', 'hello.txt,side.txt')).stdout).toContain('added T-1')
    // the .env is only in the merge commit itself (git log lists a merge's files only with --cc), and a later commit deletes it
    const fakeGit = `git add -A && ${W} commit -qm "worker: hello" && ${W} merge -q --no-ff --no-commit side && echo x=1 > .env && git add -f .env && ${W} commit -qm "merge side" && git rm -q .env && ${W} commit -qm "worker: drop it"`
    const tick = await r.cli({ FAKE_GIT: fakeGit }, 'tick')
    expect(tick.stdout).toMatch(/T-1 "Hello and side" merged into main/)
    expect((await r.git('show', 'main:side.txt')).stdout).toBe('from the side branch\n')
    expect((await r.git('log', '--cc', '--format=', '--name-only', 'main')).stdout.split('\n')).not.toContain('.env')
  } finally {
    await rm(r.repo, { recursive: true, force: true })
  }
}, 600_000)

test('T-1053: a bisect the worker left unfinished (its folder off the branch) is ended, and the branch\'s work merges', async () => {
  const r = await scratchRepo('wbisect', 'side.txt', 'test -f hello.txt\n')
  try {
    expect((await r.cli({}, 'add', 'Say hello', 'Write hello.txt', '--files', 'hello.txt')).stdout).toContain('added T-1')
    // two commits, then a bisect between main and them checks out the first one (HEAD detached)
    const fakeGit = `echo one > hello.txt && git add -A && ${W} commit -qm w1 && echo two > hello.txt && ${W} commit -qam w2 && git bisect start HEAD HEAD~2 >/dev/null && test -z "$(git symbolic-ref -q HEAD)"`
    const tick = await r.cli({ FAKE_GIT: fakeGit }, 'tick')
    expect(tick.stdout).toMatch(/T-1 "Say hello" merged into main/)
    expect((await r.git('show', 'main:hello.txt')).stdout).toBe('two\n')
  } finally {
    await rm(r.repo, { recursive: true, force: true })
  }
}, 600_000)

test('T-1053: a merged-in file outside the task\'s files fails the scope check; the retry from the kept branch merges without the other branch\'s commits', async () => {
  const r = await scratchRepo('wscope', 'out.txt', 'test -f hello.txt\n')
  try {
    expect((await r.cli({}, 'add', 'Say hello', 'Write hello.txt', '--files', 'hello.txt')).stdout).toContain('added T-1')
    await r.cli({ FAKE_GIT: `git add -A && ${W} commit -qm "worker: hello" && ${W} merge -q --no-ff --no-edit side` }, 'tick')
    const t = await r.task('T-1')
    expect(t.status).toBe('failed')
    expect(JSON.stringify(t.timeline)).toContain('out.txt')
    expect((await r.git('ls-tree', '-r', '--name-only', 'main')).stdout).not.toContain('out.txt')
    // the undo leaves the branch without the file and without side's commits, so they never reach main later
    expect((await r.git('ls-tree', '-r', '--name-only', 'symcc/T-1')).stdout).not.toContain('out.txt')
    expect((await r.git('merge-base', '--is-ancestor', 'side', 'symcc/T-1')).exitCode).toBe(1)
    // main moves on; the retry starts from the kept branch (brought up to date) and merges
    await r.git('commit', '-q', '--allow-empty', '-m', 'owner: main moved')
    expect((await r.cli({}, 'tool', 'retry', JSON.stringify({ task: 'T-1' }))).stdout).toContain('T-1')
    const tick = await r.cli({}, 'tick')
    expect(tick.stdout).toMatch(/T-1 "Say hello" merged into main/)
    expect((await r.git('show', 'main:hello.txt')).stdout).toBe('hello from the fake worker\n')
    expect((await r.git('ls-tree', '-r', '--name-only', 'main')).stdout).not.toContain('out.txt')
    expect((await r.git('merge-base', '--is-ancestor', 'side', 'main')).exitCode).toBe(1)
  } finally {
    await rm(r.repo, { recursive: true, force: true })
  }
}, 600_000)

// A fast-forward merge leaves no merge commit (side's commits sit on the branch's first-parent line), and a merge whose
// file is deleted again leaves no net change: both must still fail the scope check, and the undo must take side's
// commits off the branch, so a retry never brings them to main with their work undone.
for (const [name, fakeGit] of [
  ['a fast-forward merge of another branch', `${W} merge -q --ff-only side`],
  ['a merge of another branch whose file outside the task is deleted again', `git add -A && ${W} commit -qm "worker: hello" && ${W} merge -q --no-ff --no-edit side && git rm -q out.txt && ${W} commit -qm "worker: drop it"`],
] as const) {
  test(`T-1053: ${name} fails the scope check; the undo takes that branch's commits off, and the retry merges without them`, async () => {
    const r = await scratchRepo('wscope2', 'out.txt', 'test -f hello.txt\n')
    try {
      expect((await r.cli({}, 'add', 'Say hello', 'Write hello.txt', '--files', 'hello.txt')).stdout).toContain('added T-1')
      await r.cli({ FAKE_GIT: fakeGit }, 'tick')
      const t = await r.task('T-1')
      expect(t.status).toBe('failed')
      expect(JSON.stringify(t.timeline)).toContain('out.txt')
      expect((await r.git('merge-base', '--is-ancestor', 'side', 'symcc/T-1')).exitCode).toBe(1)
      expect((await r.git('ls-tree', '-r', '--name-only', 'symcc/T-1')).stdout).not.toContain('out.txt')
      expect((await r.cli({}, 'tool', 'retry', JSON.stringify({ task: 'T-1' }))).stdout).toContain('T-1')
      expect((await r.cli({}, 'tick')).stdout).toMatch(/T-1 "Say hello" merged into main/)
      expect((await r.git('show', 'main:hello.txt')).stdout).toBe('hello from the fake worker\n')
      expect((await r.git('merge-base', '--is-ancestor', 'side', 'main')).exitCode).toBe(1)
    } finally {
      await rm(r.repo, { recursive: true, force: true })
    }
  }, 600_000)
}

// A merged-in branch whose commit only deletes a file outside the task, the file brought back in the merge commit: the
// branch's net change and the merge commit itself don't list the file, but the delete commit does, so the scope check
// fails and that branch's commits never reach main (checker, try 9).
test('T-1053: a merged-in commit that only deletes a file outside the task fails the scope check, even when the merge restores it', async () => {
  const r = await scratchRepo('wscopedel', 'side.txt', 'test -f hello.txt\n')
  try {
    await writeFile(`${r.repo}/out.txt`, 'the owner\'s file\n')
    await r.git('add', 'out.txt')
    await r.git('commit', '-qm', 'owner: out.txt')
    await r.git('checkout', '-q', '-b', 'del')
    await r.git('rm', '-q', 'out.txt')
    await r.git('commit', '-qm', 'del: drop out.txt')
    await r.git('checkout', '-q', 'main')
    expect((await r.cli({}, 'add', 'Say hello', 'Write hello.txt', '--files', 'hello.txt')).stdout).toContain('added T-1')
    const fakeGit = `git add -A && ${W} commit -qm "worker: hello" && ${W} merge -q --no-ff --no-commit del; git checkout HEAD -- out.txt && ${W} commit -qm "merge del"`
    await r.cli({ FAKE_GIT: fakeGit }, 'tick')
    const t = await r.task('T-1')
    expect(t.status).toBe('failed')
    expect(JSON.stringify(t.timeline)).toContain('out.txt')
    expect((await r.git('merge-base', '--is-ancestor', 'del', 'symcc/T-1')).exitCode).toBe(1)
    expect((await r.cli({}, 'tool', 'retry', JSON.stringify({ task: 'T-1' }))).stdout).toContain('T-1')
    expect((await r.cli({}, 'tick')).stdout).toMatch(/T-1 "Say hello" merged into main/)
    expect((await r.git('show', 'main:out.txt')).stdout).toBe('the owner\'s file\n')
    expect((await r.git('merge-base', '--is-ancestor', 'del', 'main')).exitCode).toBe(1)
  } finally {
    await rm(r.repo, { recursive: true, force: true })
  }
}, 600_000)

// A merge or cherry-pick the worker left stopped on a conflict: prep aborts it, so the conflict markers are never
// committed; the worker's own commit before it merges as usual. `cherry-pick -n` and `merge --squash` leave nothing to
// abort (no CHERRY_PICK_HEAD or MERGE_HEAD): prep resets the files, so the folder is not stuck (checker, try 10).
for (const [name, op] of [
  ['merge', 'merge -q --no-edit side'],
  ['cherry-pick', 'cherry-pick side'],
  ['cherry-pick -n', 'cherry-pick -n side'],
  ['merge --squash', 'merge -q --squash side'],
] as const) {
  test(`T-1053: a ${name} the worker left on a conflict is aborted in prep; no conflict markers reach main`, async () => {
    const r = await scratchRepo(`wconflict-${name}`, 'hello.txt', 'test -f hello.txt\n')
    try {
      expect((await r.cli({}, 'add', 'Say hello', 'Write hello.txt', '--files', 'hello.txt')).stdout).toContain('added T-1')
      const fakeGit = `git add -A && ${W} commit -qm "worker: hello" && { ${W} ${op} >/dev/null 2>&1; test -n "$(git ls-files -u)"; }`
      const tick = await r.cli({ FAKE_GIT: fakeGit }, 'tick')
      expect(tick.stdout).toMatch(/T-1 "Say hello" merged into main/)
      expect((await r.git('show', 'main:hello.txt')).stdout).toBe('hello from the fake worker\n')
    } finally {
      await rm(r.repo, { recursive: true, force: true })
    }
  }, 600_000)
}

// A merge whose conflict the worker resolved and staged but did not commit (the merge_main prompt allows leaving that
// to symcc) is kept: symcc's commit finishes it as a merge commit, so the resolution and the merged-in branch reach main.
test('T-1053: a merge the worker resolved but did not commit is committed by symcc as a merge, not aborted', async () => {
  const r = await scratchRepo('wresolve', 'hello.txt', 'test -f hello.txt\n')
  try {
    expect((await r.cli({}, 'add', 'Say hello', 'Write hello.txt', '--files', 'hello.txt')).stdout).toContain('added T-1')
    const fakeGit = `git add -A && ${W} commit -qm "worker: hello" && { ${W} merge -q --no-edit side >/dev/null 2>&1; echo resolved > hello.txt; git add -A; test -z "$(git ls-files -u)"; }`
    const tick = await r.cli({ FAKE_GIT: fakeGit }, 'tick')
    expect(tick.stdout).toMatch(/T-1 "Say hello" merged into main/)
    expect((await r.git('show', 'main:hello.txt')).stdout).toBe('resolved\n')
    expect((await r.git('merge-base', '--is-ancestor', 'side', 'main')).exitCode).toBe(0)
    expect((await r.git('log', '--merges', '--format=%H', 'main')).stdout.trim()).not.toBe('')
  } finally {
    await rm(r.repo, { recursive: true, force: true })
  }
}, 600_000)
