// The Node host (T-377), run with bun test (scripts/test-node-host.sh), not `claude plugin test`: that runtime has no
// files or processes. One task goes end to end through the CLI on a scratch git repo, with a fake `claude -p`
// (fake-claude.sh, no model): add, the worker "edits" a file in its worktree, the tests run, it merges, and the board
// shows it done. Also: hosts/node/ never imports Claude Code or hooks/claude/, and the claude -p runner's flags and
// result reader.
import { test, expect } from 'bun:test'
import { readFile, readdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { runCommand, PLUGIN_ROOT } from '../host'
import { claudePermissions, claudeResult, editRule, withBasePrompt } from '../runner'
import { WORKER_BASE, SCOUT_BASE } from '../../../hooks/core/prompts'
import { SYMCC_WORDS } from '../../../hooks/host'

test('withBasePrompt puts WORKER_BASE in front of a worker\'s prompt, and SCOUT_BASE in front of a scout\'s or checker\'s', () => {
  const tool = (t: string) => SYMCC_WORDS.tool('symcc', t)
  expect(withBasePrompt({ kind: 'worker', prompt: 'Task T-1' })).toBe(`${WORKER_BASE('symcc', tool)}\n\nTask T-1`)
  expect(withBasePrompt({ kind: 'scout', prompt: 'Look' })).toBe(`${SCOUT_BASE('symcc', tool)}\n\nLook`)
  expect(withBasePrompt({ kind: 'checker', prompt: 'Check' })).toBe(`${SCOUT_BASE('symcc', tool)}\n\nCheck`)
})

const NODE = `${PLUGIN_ROOT}/hosts/node`
const MAIN = `${NODE}/main.ts`
const FAKE = `${NODE}/tests/fake-claude.sh`

/**
 * The imports of `text` that bind it to Claude Code: 'claude-code' (or 'claude-code/...'), hooks/claude/, register.tsx.
 * Every module name counts: after `from` (on any line, so the end of a long name list too), a bare `import '...'`, and
 * a dynamic `import('...')` / `await import('...')` (quotes or backticks).
 */
export function claudeImports(text: string): string[] {
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

test('hosts/node/ imports nothing from Claude Code or hooks/claude/', async () => {
  // the check itself catches each kind of import (the samples are built, so this file holds none of them as an import)
  const imp = (names: string, from: string) => `import ${names} from '${from}'`
  const CC = ['claude', 'code'].join('-')
  const HC = ['../../hooks', 'claude'].join('/')
  expect(claudeImports(imp('type { $ }', CC))).toEqual([CC])
  expect(claudeImports(imp('{ expect }', `${CC}/testing`))).toEqual([`${CC}/testing`])
  expect(claudeImports(imp('{ claudeHost }', `${HC}/host`))).toEqual([`${HC}/host`])
  expect(claudeImports(imp('{ claudeHost }', HC))).toEqual([HC])
  expect(claudeImports(imp('x', '../../hooks/register'))).toEqual(['../../hooks/register'])
  expect(claudeImports(`import {\n  a,\n} from '${HC}/agents'`)).toEqual([`${HC}/agents`])
  expect(claudeImports(`import { a,\n  b } from '${HC}/host'`)).toEqual([`${HC}/host`])
  expect(claudeImports(`const h = await ${'import'}('${HC}/host')`)).toEqual([`${HC}/host`])
  expect(claudeImports(`const m = ${'import'}("${CC}")`)).toEqual([CC])
  expect(claudeImports(`${'import'} '${HC}/side'`)).toEqual([`${HC}/side`])
  expect(claudeImports(`${imp('{ S }', '../../hooks/app/state')}\n${imp('{ spawn }', 'node:child_process')}`)).toEqual([])
  const files = await filesUnder(NODE)
  expect(files.length).toBeGreaterThan(3)
  for (const f of files) expect(`${f}: ${claudeImports(await readFile(f, 'utf8')).join(', ')}`).toBe(`${f}: `)
})

test('claude -p gets the task\'s files as its permission rules, and its result line gives the answer, tokens and cost', () => {
  expect(editRule('src/a.ts')).toEqual(['Edit(./src/a.ts)', 'Write(./src/a.ts)', 'Edit(./src/a.ts/**)', 'Write(./src/a.ts/**)'])
  expect(editRule('tests/')).toEqual(['Edit(./tests/**)', 'Write(./tests/**)'])
  const w = claudePermissions({ kind: 'worker', files: ['tests/'] })
  expect(w.allowed).toEqual(['Read', 'Glob', 'Grep', 'Bash', 'Edit(./tests/**)', 'Write(./tests/**)'])
  expect(w.denied).toContain('Bash(git commit:*)')
  expect(claudePermissions({ kind: 'worker' }).allowed).toContain('Edit(./**)')
  expect(claudePermissions({ kind: 'worker', tools: ['web'] }).allowed).toContain('WebFetch')
  expect(claudePermissions({ kind: 'scout' }).allowed).not.toContain('Edit(./**)')
  expect(claudePermissions({ kind: 'checker' }).denied).toContain('Edit')
  // T-476: where the folder uses .scratch/, a worker and a checker may write there (a checker only there); a scout may not
  const SCRATCH = ['Edit(./.scratch/**)', 'Write(./.scratch/**)']
  expect(claudePermissions({ kind: 'worker', files: ['tests/'] }, true).allowed).toEqual([...w.allowed, ...SCRATCH])
  const c = claudePermissions({ kind: 'checker' }, true)
  expect(c.allowed).toEqual(['Read', 'Glob', 'Grep', 'Bash', ...SCRATCH])
  expect(c.denied).not.toContain('Edit')
  expect(c.denied).not.toContain('Write')
  expect(c.denied).toContain('NotebookEdit')
  expect(claudePermissions({ kind: 'scout' }, true).allowed).not.toContain(SCRATCH[0])
  expect(claudePermissions({ kind: 'checker' }).allowed).not.toContain(SCRATCH[0])
  const line = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'done', total_cost_usd: 0.5, usage: { input_tokens: 3, output_tokens: 4 }, permission_denials: [{ tool_name: 'Write', tool_input: { file_path: '/w/x.txt' } }] })
  expect(claudeResult({ stdout: `{"type":"system"}\n${line}\n`, stderr: '', exitCode: 0, killed: false })).toEqual({ answer: 'done', end: { reason: 'answer' }, isAborted: false, tokens: { input: 3, output: 4 }, cost: 0.5, denied: ['Write /w/x.txt'] })
  expect(claudeResult({ stdout: '', stderr: 'boom', exitCode: 1, killed: false })).toEqual({ answer: 'boom', end: { reason: 'error' }, isAborted: false, tokens: undefined })
  expect(claudeResult({ stdout: '', stderr: '', exitCode: 143, killed: true }).isAborted).toBe(true)
  expect(claudeResult({ stdout: JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true, result: '' }), stderr: '', exitCode: 1, killed: false }).end).toEqual({ reason: 'error' })
})

// Claude Code's Bash rule matching: `Bash(x:*)` is x alone or x then a space; another `*` matches anything.
function bashRuleMatches(rule: string, cmd: string): boolean {
  const m = /^Bash\((.*)\)$/.exec(rule)
  const r = m?.[1]
  if (r === undefined) return false
  const p = r.endsWith(':*') ? `${r.slice(0, -2)} *` : r
  if (p.endsWith(' *') && cmd === p.slice(0, -2)) return true
  return new RegExp(`^${p.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(cmd)
}

test('T-496: claude -p deny rules refuse every git write for a worker and a checker, also through -C, --git-dir and wrappers', () => {
  const bad = [
    'git commit -m x', 'git merge main', 'git init', 'git init /tmp/x', 'git -C /tmp/x commit -m x', 'git -C . merge main',
    'git -C .. init', 'git --git-dir=/r/.git commit', 'git --work-tree=/r reset --hard', 'git -c core.hooksPath=x commit',
    'git --no-pager commit', 'git reset --hard', 'git checkout main', 'git switch -c x', 'git branch -f main HEAD',
    'git branch -D x', 'git push', 'git stash', 'git stash pop', 'git rebase main', 'git cherry-pick abc', 'git tag v1',
    'git update-ref refs/heads/main HEAD', 'git add -A', 'git restore .', 'git clean -fd', 'git worktree add x',
    'git config user.name x', 'git am p', 'git pull', 'env git commit', 'xargs git commit', 'command git push',
  ]
  const good = ['git status', 'git diff', 'git log -3', 'git show HEAD', 'git blame a.ts', 'git ls-files', 'git rev-parse HEAD', 'git grep x', 'bun test', 'sh scripts/test-node-host.sh']
  for (const p of [claudePermissions({ kind: 'worker', files: ['tests/'] }), claudePermissions({ kind: 'checker' }), claudePermissions({ kind: 'worker' }, true), claudePermissions({ kind: 'checker' }, true)]) {
    for (const c of bad) expect(`${c}: ${p.denied.some(r => bashRuleMatches(r, c))}`).toBe(`${c}: true`)
    for (const c of good) expect(`${c}: ${p.denied.some(r => bashRuleMatches(r, c))}`).toBe(`${c}: false`)
  }
})

test('one task end to end on the Node host: add, a fake claude -p worker edits its worktree, tests run, it merges, the board says done', async () => {
  const repo = await mkdtemp('/tmp/symcc-node-host-')
  const log = `${repo}.fake`
  try {
    const git = (...args: string[]) => runCommand(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo })
    await git('init', '-q', '-b', 'main')
    await writeFile(`${repo}/check.sh`, 'test "$(cat hello.txt)" = "hello from the fake worker"\n')
    await writeFile(`${repo}/.gitignore`, '.symcc/\n')
    await git('add', '.')
    await git('commit', '-qm', 'init')
    const cli = (...args: string[]) => runCommand(['bun', MAIN, '--root', repo, '--claude', FAKE, ...args], { cwd: repo, env: { FAKE_LOG: log, FAKE_SCRATCH: '1' }, timeoutMs: 120_000 })

    expect((await cli('tool', 'settings', JSON.stringify({ test_commands: ['sh check.sh'] }))).stdout).toContain('sh check.sh')
    const added = await cli('add', 'Say hello', 'Write hello.txt with a greeting', '--files', 'hello.txt')
    expect(added.stdout).toContain('added T-1')
    // add doesn't start the worker: only a tick does
    expect(JSON.parse(await readFile(`${repo}/.symcc/board.json`, 'utf8')).tasks[0].status).toBe('todo')

    const tick = await cli('tick')
    expect(tick.exitCode).toBe(0)
    expect(tick.stdout).toContain('1 done')
    expect(tick.stdout).toMatch(/T-1 "Say hello" merged into main/)

    // the worker ran in its own worktree, with the task's file as its only edit rule, and the prompt on stdin
    expect((await readFile(`${log}.cwd`, 'utf8')).trim()).toMatch(/\.symcc\/worktrees\/T-1$/)
    const args = await readFile(`${log}.args`, 'utf8')
    expect(args).toContain('dontAsk')
    expect(args).toContain('Edit(./hello.txt)')
    expect(args).not.toContain('Edit(./**)')
    // the prompt starts with the worker's base prompt (T-473), in symcc's own words, then the task's prompt
    const prompt = await readFile(`${log}.prompt`, 'utf8')
    expect(prompt.startsWith(`${WORKER_BASE('symcc', t => SYMCC_WORDS.tool('symcc', t))}\n\n`)).toBe(true)
    expect(prompt).toContain('Task T-1: Say hello')

    // merged into main, and the board keeps the try's tokens and cost
    expect((await git('log', '--format=%s', 'main')).stdout).toContain('T-1: Say hello')
    expect((await git('show', 'main:hello.txt')).stdout).toBe('hello from the fake worker\n')
    // the worker's throwaway script under .scratch/ was not committed (T-456), and real git staged the rest (T-477)
    expect((await git('ls-tree', '-r', '--name-only', 'main')).stdout.split('\n')).not.toContain('.scratch/edit.py')
    expect((await git('log', '--all', '--name-only', '--format=')).stdout).not.toContain('.scratch')
    const t = JSON.parse(await readFile(`${repo}/.symcc/board.json`, 'utf8')).tasks[0]
    expect(t.status).toBe('done')
    expect(t.runs[0].cost).toBe(0.0123)
    expect(t.runs[0].tokens).toEqual({ input: 100, output: 20, cache_write: 7, cache_read: 5 })

    const board = await cli('board')
    expect(board.stdout).toContain('1 done')
    expect((await cli('tool', 'board', JSON.stringify({ task: 'T-1' }))).stdout).toContain('done')
  } finally {
    await rm(repo, { recursive: true, force: true })
    for (const f of ['args', 'prompt', 'cwd']) await rm(`${log}.${f}`, { recursive: true, force: true })
  }
}, 300_000)

test('a tick that stops waiting stops its claude -p worker: the task goes back to todo and the worker never edits after the CLI ended', async () => {
  const repo = await mkdtemp('/tmp/symcc-node-quit-')
  try {
    const git = (...args: string[]) => runCommand(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo })
    await git('init', '-q', '-b', 'main')
    await writeFile(`${repo}/.gitignore`, '.symcc/\n')
    await git('add', '.')
    await git('commit', '-qm', 'init')
    const cli = (env: Record<string, string>, ...args: string[]) => runCommand(['bun', MAIN, '--root', repo, '--claude', FAKE, ...args], { cwd: repo, env, timeoutMs: 120_000 })
    expect((await cli({}, 'add', 'Say hello', '--files', 'hello.txt')).stdout).toContain('added T-1')

    // the fake worker waits 600 s before it writes, far past the tick's wait, however busy the machine is
    const pidFile = `${repo}/.symcc/fake.pid`
    const board = async () => JSON.parse(await readFile(`${repo}/.symcc/board.json`, 'utf8')).tasks[0]
    // T-524: on a busy machine the worker's start (its worktree, its settings) can outlast the tick's wait, and then no
    // worker process ever ran, so there was nothing to stop. That tick must also leave the task "todo" with no worker
    // (no pid, no edit); the next tick waits longer, until one stops a worker that really ran.
    let tick = { stdout: '', stderr: '' }
    for (const minutes of ['0.05', '0.25', '1']) {
      tick = await cli({ FAKE_SLEEP: '600', FAKE_PID: pidFile }, '--wait-minutes', minutes, 'tick')
      expect(tick.stdout).toContain('stopped waiting')
      if (tick.stderr.includes('stopped T-1')) break
      expect(`${minutes}: ${(await board()).status}`).toBe(`${minutes}: todo`)
      expect(await readFile(pidFile, 'utf8').catch(() => 'none')).toBe('none')
      expect(await readFile(`${repo}/.symcc/worktrees/T-1/hello.txt`, 'utf8').catch(() => 'none')).toBe('none')
    }
    expect(tick.stderr).toContain('stopped T-1')
    const t = await board()
    expect(t.status).toBe('todo')
    expect(t.note).toContain('continues on the next run')

    // the worker and all it started are gone once the CLI ended (T-509: checked on its process group, not by waiting
    // out its sleep on the clock, which a busy machine could miss): it can never edit, so its worktree has no hello.txt
    const group = Number((await readFile(pidFile, 'utf8')).trim())
    expect(group).toBeGreaterThan(1)
    expect(await groupGone(group)).toBe(true)
    expect(await readFile(`${repo}/.symcc/worktrees/T-1/hello.txt`, 'utf8').catch(() => 'none')).toBe('none')
  } finally {
    // a failed stop must not leave the fake's sleep running after the test
    const group = Number((await readFile(`${repo}/.symcc/fake.pid`, 'utf8').catch(() => '')).trim())
    if (group > 1) await runCommand(['sh', '-c', 'kill -s KILL -- -"$1"', 'sh', String(group)])
    await rm(repo, { recursive: true, force: true })
  }
}, 300_000)

/**
 * Whether process group `group` has no process left, looking every 100 ms for at most `ms` (an ended process can
 * take a moment to be reaped on a busy machine). A live group answers false only after `ms`.
 */
async function groupGone(group: number, ms = 60_000): Promise<boolean> {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise<void>(r => void setTimeout(r, 100))) {
    if ((await runCommand(['sh', '-c', 'kill -s 0 -- -"$1"', 'sh', String(group)])).exitCode !== 0) return true
  }
  return false
}

test('an option with no value is refused: a bare --files never adds a task that may edit anywhere', async () => {
  const dir = await mkdtemp('/tmp/symcc-node-args-')
  try {
    const r = await runCommand(['bun', MAIN, '--root', dir, 'add', 'Title', '--files'], { cwd: dir })
    expect(r.exitCode).toBe(2)
    expect(r.stderr).toContain('--files needs a value')
    expect(await readFile(`${dir}/.symcc/board.json`, 'utf8').catch(() => 'none')).toBe('none')
    const r2 = await runCommand(['bun', MAIN, '--root', dir, 'add', 'Title', '--files', '--why', 'x'], { cwd: dir })
    expect(r2.stderr).toContain('--files needs a value')
    for (const bad of ['abc', '0', '-1']) {
      const r3 = await runCommand(['bun', MAIN, '--root', dir, '--wait-minutes', bad, 'tick'], { cwd: dir })
      expect(`${bad}: ${r3.exitCode}`).toBe(`${bad}: 2`)
      expect(r3.stderr).toContain('--wait-minutes needs a positive number')
    }
    expect(await readFile(`${dir}/.symcc/board.json`, 'utf8').catch(() => 'none')).toBe('none')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
