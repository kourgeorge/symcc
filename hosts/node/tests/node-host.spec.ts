// The Node host (T-377), run with bun test (scripts/test-node-host.sh), not `claude plugin test`: that runtime has no
// files or processes. One task goes end to end through the CLI on a scratch git repo, with a fake `claude -p`
// (fake-claude.sh, no model): add, the worker "edits" a file in its worktree, the tests run, it merges, and the board
// shows it done. Also: hosts/node/ never imports Claude Code or hooks/claude/, and the claude -p runner's flags and
// result reader.
import { joinedText, partsFilesNamed } from '../../../hooks/core/board-parts'
import { test, expect } from 'bun:test'
import { readFile, readdir, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { runCommand, PLUGIN_ROOT } from '../host'
import { claudePermissions, claudeResult, editRule, claudeRunner } from '../../../hooks/process/claude-runner'
import { withBasePrompt, processAgents, type AgentRunner } from '../../../hooks/process/agents'
import { PROCESSES_FILE, entriesText, parseEntries } from '../../../hooks/process/record'
import { nodeProcessSystem, runsProgram, elapsedSeconds } from '../system'
import { nodeFs, nodeProcesses, nodeProcessesWith } from '../host'
import { lockText, LOCK_STALE_MS } from '../../../hooks/core/board-file'
import { openSession, leadTool, closeSession, settle, slashCommand } from '../session'
import { toolCall, notLeadText, noPanelText } from '../../../hooks/app/symcc'
import { emptyBoard } from '../../../hooks/core/board-file'
import { taskListBoard, TASK_LIST_TEXT, EMPTY_TASK_LIST_TEXT } from '../../../tests/task-list-fixture'
import { statusBoard, statusHeadings, statusSection, statusTail, statusTailWant, statusTodayLines } from '../../../tests/status-fixture'
import { statusHint } from '../../../hooks/core/live-text'
import { TOOLS } from '../../../hooks/app/tools'
import { S, toolName, starting } from '../../../hooks/app/state'
import { pump } from '../../../hooks/app/workers'
import { WORKER_BASE, SCOUT_BASE, NO_TOOLS_ASK } from '../../../hooks/core/prompts'
import { ASK_LINE, ASK_TOOL } from '../../../hooks/core/ask'
import { changedSinceText, CHANGED_ASK, CHANGED_ASK_NO_TOOLS } from '../../../hooks/core/changed-since'
import CHANGE from '../../../prompts/change'
import INVESTIGATION from '../../../prompts/investigation'
import CHECKER from '../../../prompts/checker'
import { SYMCC_WORDS } from '../../../hooks/host'
import { scoutPrompt } from '../../../hooks/core/scouts'
import { tryCost, tryTokens } from '../../../hooks/core/runs'
import { DEBRIEF_TEXT } from '../../../hooks/core/org-mem'

/** T-795: a new project is off until the owner runs /symcc-init; a real one does that first. */
const enableHere = (repo: string) => runCommand(['bun', MAIN, '--root', repo, '--claude', FAKE, 'cmd', 'symcc-init'], { cwd: repo, timeoutMs: 120_000 })

test('withBasePrompt puts WORKER_BASE in front of a worker\'s prompt, and SCOUT_BASE in front of a scout\'s or checker\'s, naming none of symcc\'s tools (T-474)', () => {
  const tool = (t: string) => SYMCC_WORDS.tool('symcc', t)
  const no = { symccTools: false }
  expect(withBasePrompt({ kind: 'worker', prompt: 'Task T-1' })).toBe(`${WORKER_BASE('symcc', tool, false, false)}\n\nTask T-1`)
  expect(withBasePrompt({ kind: 'worker', prompt: 'Task T-1', tools: ['web'] })).toBe(`${WORKER_BASE('symcc', tool, true, false)}\n\nTask T-1`)
  // T-900: a worker of a code: false role checks its facts and links instead of running tests
  expect(withBasePrompt({ kind: 'worker', prompt: 'Task T-1', prose: true })).toBe(`${WORKER_BASE('symcc', tool, false, false, true)}\n\nTask T-1`)
  expect(withBasePrompt({ kind: 'worker', prompt: 'Task T-1', prose: true })).toContain('check your facts and links')
  expect(withBasePrompt({ kind: 'scout', prompt: 'Look' })).toBe(`${SCOUT_BASE('symcc', tool, no)}\n\nLook`)
  expect(withBasePrompt({ kind: 'checker', prompt: 'Check' })).toBe(`${SCOUT_BASE('symcc', tool, no)}\n\nCheck`)
  // the task prompt's "call the ask_owner tool" line becomes "write the question in your report"
  const p = withBasePrompt({ kind: 'worker', prompt: `Task T-1\n${ASK_LINE(tool(ASK_TOOL))}` })
  expect(p).not.toContain(ASK_TOOL)
  expect(p).toContain(NO_TOOLS_ASK)
  // T-942: so does the stale-task check's "ask the owner with the ask_owner tool" sentence
  const since = changedSinceText({ created: '2026-11-01T00:00:00.000Z', nowMs: Date.parse('2026-11-23T00:00:00.000Z'), total: 1, scope: 'files', commits: ['abc0000 change'] }, tool(ASK_TOOL))!
  expect(since).toContain(CHANGED_ASK(tool(ASK_TOOL)))
  const old = withBasePrompt({ kind: 'worker', prompt: `Task T-1\n${since}\n${ASK_LINE(tool(ASK_TOOL))}` })
  expect(old).toContain(CHANGED_ASK_NO_TOOLS)
  expect(old.includes(ASK_TOOL)).toBe(false)
  // the hosts with symcc's tools keep them in the base prompt
  expect(WORKER_BASE('symcc', tool)).toContain(ASK_TOOL)
  expect(SCOUT_BASE('symcc', tool)).toContain('board and stats tools')
})

/** The tool names a prompt could name: the host's own (claude -p) and every one of symcc's. */
const TOOL_NAMES = () => ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'NotebookEdit', 'Task', 'AskUserQuestion', ASK_TOOL, ...TOOLS().map(t => t.name)]

/** The tools `prompt` tells the agent to use ("the X tool", "the X and Y tools"). */
function namedTools(prompt: string): string[] {
  // "the X tool", "the X and Y tools", and "the symcc tools X and Y"; the web counts as WebSearch and WebFetch
  const web = /\bthe web\b/.test(prompt) ? ['WebSearch', 'WebFetch'] : []
  const named = TOOL_NAMES().filter(n => new RegExp(`\\b${n}\\b(?: and \\w+)? tools?\\b|\\b\\w+ and ${n} tools\\b|\\btools ${n}\\b|\\btools \\w+ and ${n}\\b`).test(prompt))
  return [...new Set([...named, ...web])]
}

/** Whether permission rules `allowed` let the agent use tool `name` (a plain rule, or a rule on some paths). */
const allows = (allowed: readonly string[], name: string) => allowed.some(r => r === name || r.startsWith(`${name}(`))

test('T-474: a process worker\'s, scout\'s and checker\'s prompt names no tool its claude -p permissions don\'t allow', () => {
  const tool = (t: string) => SYMCC_WORDS.tool('symcc', t)
  const ask = ASK_LINE(tool(ASK_TOOL))
  // the check itself finds a named tool
  expect(namedTools(`call the ${ASK_TOOL} tool`)).toEqual([ASK_TOOL])
  expect(namedTools('use the board and stats tools')).toEqual(['board', 'stats'])
  expect(namedTools('look at the board')).toEqual([])
  expect(namedTools('use the symcc tools board and stats rather than reading')).toEqual(['board', 'stats'])
  expect(namedTools('search or fetch pages on the web')).toEqual(['WebSearch', 'WebFetch'])
  // the real scout prompt names them (a scout agent type has them), the process scout's doesn't
  const real = scoutPrompt({ scout: 'bugs', root: '/r', instructions: 'x', open: [] })
  expect(namedTools(real)).toEqual(['board', 'stats', 'WebSearch', 'WebFetch'])
  expect(withBasePrompt({ kind: 'scout', prompt: real })).toContain('read .symcc/board.json yourself')
  expect(withBasePrompt({ kind: 'scout', prompt: real, tools: ['web'] })).toContain('search or fetch pages on the web')
  const cases = [
    { a: { kind: 'worker' as const, files: ['src/'] }, prompt: CHANGE.replace('{{ask}}', ask) },
    { a: { kind: 'worker' as const, tools: ['web'] }, prompt: INVESTIGATION.replace('{{ask}}', ask) },
    { a: { kind: 'scout' as const }, prompt: scoutPrompt({ scout: 'bugs', root: '/r', instructions: 'find bugs', open: [] }) },
    { a: { kind: 'scout' as const }, prompt: scoutPrompt({ scout: 'bugs', root: '/r', instructions: 'find bugs', open: ['T-1 a task'], name: 'symcc', lastRun: '2026-11-01T00:00:00Z' }) },
    { a: { kind: 'scout' as const, tools: ['web'] }, prompt: scoutPrompt({ scout: 'deps', root: '/r', instructions: 'Check the dependencies on the web.', open: [] }) },
    { a: { kind: 'checker' as const }, prompt: CHECKER },
  ]
  for (const scratch of [false, true]) {
    for (const c of cases) {
      const { allowed } = claudePermissions(c.a, scratch)
      const prompt = withBasePrompt({ ...c.a, prompt: c.prompt })
      const refused = namedTools(prompt).filter(n => !allows(allowed, n))
      expect(`${c.a.kind}${scratch ? ' with scratch' : ''}: ${refused.join(', ')}`).toBe(`${c.a.kind}${scratch ? ' with scratch' : ''}: `)
    }
  }
  // the checker (T-551: it never runs the project's tests itself) stays read-only, apart from .scratch/ writes
  const c = claudePermissions({ kind: 'checker' }, true)
  expect(c.allowed.filter(r => r.startsWith('Edit') || r.startsWith('Write'))).toEqual(['Edit(./.scratch/**)', 'Write(./.scratch/**)'])
  expect(withBasePrompt({ kind: 'checker', prompt: CHECKER })).toContain('checker. A worker has just finished task')
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

test('T-870: runCommand gives 127 only for a command that does not exist, and 124 for a timeout', async () => {
  expect((await runCommand(['symcc-no-such-command-t870'], { cwd: '/' })).exitCode).toBe(127)
  expect((await runCommand(['sleep', '5'], { cwd: '/', timeoutMs: 100 })).exitCode).toBe(124)
})

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
  expect(w.denied).toContain('Bash(git push:*)')
  expect(w.denied).not.toContain('Bash(git commit:*)')
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
  for (const p of [claudePermissions({ kind: 'checker' }), claudePermissions({ kind: 'checker' }, true), claudePermissions({ kind: 'scout' })]) {
    for (const c of bad) expect(`${c}: ${p.denied.some(r => bashRuleMatches(r, c))}`).toBe(`${c}: true`)
    for (const c of good) expect(`${c}: ${p.denied.some(r => bashRuleMatches(r, c))}`).toBe(`${c}: false`)
  }
})

test('T-1053: a claude -p worker may change git on its own branch; push, other branches, stash, worktree, config, tags and -C stay refused', () => {
  const own = ['git commit -m x', 'git merge main', 'git merge --no-edit symcc/T-7', 'git cherry-pick abc', 'git revert HEAD', 'git restore .', 'git reset --hard', 'git add -A', 'git rm a.ts', 'git clean -fd', 'git am p', 'git apply p.diff', 'git bisect start']
  const bad = [
    'git push', 'git push . HEAD:main', 'git remote add x y', 'git branch -D x', 'git branch -f main HEAD', 'git checkout main', 'git checkout -- a.ts',
    'git switch main', 'git rebase main', 'git fetch . HEAD:main', 'git pull', 'git stash', 'git stash pop', 'git worktree add x', 'git config user.name x',
    'git tag v1', 'git update-ref refs/heads/main HEAD', 'git -C /r commit -m x', 'git -C . merge main', 'git --git-dir=/r/.git commit', 'git -c core.hooksPath=x commit',
    'git init', 'env git commit', 'xargs git commit',
    'git bisect run sh evil.sh', 'git bisect reset other', 'git merge --autostash main', 'git merge --no-edit --autostash main', 'git rebase --root other',
  ]
  for (const p of [claudePermissions({ kind: 'worker', files: ['tests/'] }), claudePermissions({ kind: 'worker' }, true)]) {
    for (const c of own) expect(`${c}: ${p.denied.some(r => bashRuleMatches(r, c))}`).toBe(`${c}: false`)
    for (const c of bad) expect(`${c}: ${p.denied.some(r => bashRuleMatches(r, c))}`).toBe(`${c}: true`)
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
    await enableHere(repo)
    const cli = (...args: string[]) => runCommand(['bun', MAIN, '--root', repo, '--claude', FAKE, ...args], { cwd: repo, env: { FAKE_LOG: log, FAKE_SCRATCH: '1', FAKE_DEBRIEF: 'Suggested for org-mem:\n- Run one test file with sh check.sh.' }, timeoutMs: 120_000 })

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
    expect(prompt.startsWith(`${WORKER_BASE('symcc', t => SYMCC_WORDS.tool('symcc', t), false, false)}\n\n`)).toBe(true)
    expect(prompt).toContain('# Task T-1: ')
    // T-474: it names no tool its permission flags (the arguments) don't allow: no ask_owner, no board tools
    const allowedArgs = args.split('\n').slice(args.split('\n').indexOf('--allowedTools') + 1, args.split('\n').indexOf('--disallowedTools'))
    expect(namedTools(prompt).filter(n => !allows(allowedArgs, n))).toEqual([])
    expect(prompt).not.toContain(ASK_TOOL)
    // it ended, so the record of running processes has no entry left
    expect(parseEntries(await readFile(`${repo}/.symcc/${PROCESSES_FILE}`, 'utf8').catch(() => null))).toEqual([])

    // merged into main, and the board keeps the try's tokens and cost
    expect((await git('log', '--format=%s', 'main')).stdout).toContain('T-1: Say hello')
    expect((await git('show', 'main:hello.txt')).stdout).toBe('hello from the fake worker\n')
    // the worker's throwaway script under .scratch/ was not committed (T-456), and real git staged the rest (T-477)
    expect((await git('ls-tree', '-r', '--name-only', 'main')).stdout.split('\n')).not.toContain('.scratch/edit.py')
    expect((await git('log', '--all', '--name-only', '--format=')).stdout).not.toContain('.scratch')
    // a done task's tries are in its parts file (T-675), joined back here
    const saved = await readFile(`${repo}/.symcc/board.json`, 'utf8')
    const parts = new Map<string, string | null>()
    for (const rel of partsFilesNamed(JSON.parse(saved))) parts.set(rel, await readFile(`${repo}/.symcc/${rel}`, 'utf8').catch(() => null))
    const t = JSON.parse(joinedText(saved, rel => parts.get(rel) ?? null)).tasks[0]
    expect(t.status).toBe('done')
    // T-656: the debrief resumed the same claude -p session for one read-only turn; its tokens and cost count on the try
    expect(args).not.toContain('--no-session-persistence')
    const resumeArgs = (await readFile(`${log}.resume.args`, 'utf8')).split('\n')
    expect(resumeArgs.slice(resumeArgs.indexOf('--resume'), resumeArgs.indexOf('--resume') + 2)).toEqual(['--resume', 'fake'])
    expect(resumeArgs.slice(resumeArgs.indexOf('--allowedTools') + 1, resumeArgs.indexOf('--disallowedTools'))).toEqual(['Read', 'Glob', 'Grep'])
    expect(resumeArgs).toContain('Bash')
    expect(await readFile(`${log}.resume.prompt`, 'utf8')).toBe(DEBRIEF_TEXT)
    expect(prompt).not.toContain('"Learned:" section')
    expect(tick.stdout).toContain('- Run one test file with sh check.sh.')
    expect(Math.round(tryCost(t.runs[0])! * 1e6)).toBe(13300)
    expect(tryTokens(t.runs[0])).toEqual({ input: 110, output: 23, cache_write: 7, cache_read: 5 })

    const board = await cli('board')
    expect(board.stdout).toContain('1 done')
    expect((await cli('tool', 'board', JSON.stringify({ task: 'T-1' }))).stdout).toContain('done')
  } finally {
    await rm(repo, { recursive: true, force: true })
    for (const f of ['args', 'prompt', 'cwd', 'resume.args', 'resume.prompt']) await rm(`${log}.${f}`, { recursive: true, force: true })
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
    await enableHere(repo)
    // the longest tick waits 3 minutes, then stops its worker
    const cli = (env: Record<string, string>, ...args: string[]) => runCommand(['bun', MAIN, '--root', repo, '--claude', FAKE, ...args], { cwd: repo, env, timeoutMs: 300_000 })
    expect((await cli({}, 'add', 'Say hello', '--files', 'hello.txt')).stdout).toContain('added T-1')

    // the fake worker waits 600 s before it writes, far past the tick's wait, however busy the machine is
    const pidFile = `${repo}/.symcc/fake.pid`
    const board = async () => JSON.parse(await readFile(`${repo}/.symcc/board.json`, 'utf8')).tasks[0]
    // T-524: on a busy machine the worker's start (its worktree, its settings) can outlast the tick's wait, and then no
    // worker process ever ran, so there was nothing to stop. That tick must also leave the task "todo" with no worker
    // (no pid, no edit); the next tick waits longer, until one stops a worker that really ran. T-652: a tick that stops
    // waiting while the start is still on its way waits for it in closeSession, so the task is "todo" here too (the
    // T-652 test below checks that on its own, without the clock).
    let tick = { stdout: '', stderr: '' }
    for (const minutes of ['0.05', '0.25', '1', '3']) {
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
}, 600_000)

test('T-901: /symcc-tasks prints the open tasks grouped as on the board, an empty board only the counts; /symcc-board says there is no panel', async () => {
  const repo = await mkdtemp('/tmp/symcc-node-tasks-')
  try {
    const git = (...args: string[]) => runCommand(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo })
    await git('init', '-q', '-b', 'main')
    await writeFile(`${repo}/.gitignore`, '.symcc/\n')
    await git('add', '.')
    await git('commit', '-qm', 'init')
    await enableHere(repo)
    const s = await openSession({ root: repo, runner: claudeRunner(nodeProcessSystem, { bin: FAKE }), say: () => undefined, sessionId: 'node-t901' })
    try {
      // the board is written once the session has started (paused, so nothing starts meanwhile)
      await writeFile(`${repo}/.symcc/board.json`, JSON.stringify({ ...taskListBoard(Date.now()), mode: 'paused' }))
      expect(await slashCommand(s, 'symcc-tasks', '')).toBe(TASK_LIST_TEXT)
      expect(await slashCommand(s, 'symcc-board', '')).toBe(noPanelText())
      await writeFile(`${repo}/.symcc/board.json`, JSON.stringify({ ...emptyBoard(), mode: 'paused' }))
      expect(await slashCommand(s, 'symcc-tasks', '')).toBe(EMPTY_TASK_LIST_TEXT)
    } finally {
      await closeSession(s).catch(() => undefined)
    }
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
}, 180_000)

test('T-902: /symcc-status prints the Live tab as text (needs you, the lanes and trains, today, the notes); NEEDS YOU only while something waits', async () => {
  const repo = await mkdtemp('/tmp/symcc-node-status-')
  try {
    const git = (...args: string[]) => runCommand(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo })
    await git('init', '-q', '-b', 'main')
    await writeFile(`${repo}/.gitignore`, '.symcc/\n')
    await git('add', '.')
    await git('commit', '-qm', 'init')
    await enableHere(repo)
    const s = await openSession({ root: repo, runner: claudeRunner(nodeProcessSystem, { bin: FAKE }), say: () => undefined, sessionId: 'node-t902' })
    try {
      const now = Date.now()
      await writeFile(`${repo}/.symcc/board.json`, JSON.stringify({ ...statusBoard(now), mode: 'paused' }))
      const text = await slashCommand(s, 'symcc-status', '')
      expect(statusHeadings(text).filter(h => h !== 'BRANCHES')).toEqual(['NEEDS YOU', 'TASKS', 'TODAY', 'ORGANIZATIONAL MEMORY'])
      expect(statusSection(text, 'TASKS').some(l => l.startsWith(' ▶ T-2') && l.endsWith('↺2'))).toBe(true)
      expect(statusSection(text, 'TASKS').includes('   └─◇ T-4 Write the export  waits')).toBe(true)
      // T-938: TODAY's first row is "Now:" the mode line (no stand-alone mode line above the sections), then the figures
      expect(statusSection(text, 'TODAY')[0]!.startsWith(' Now: ⏸ paused · agents ')).toBe(true)
      expect(text.split('\n')[0]!.startsWith('─── ❯ ')).toBe(true)
      expect(statusSection(text, 'TODAY')[1]!.split('Σ')[0]).toBe(statusTodayLines(statusBoard(now), now)[1]!.split('Σ')[0])
      // T-933: the ✧ / ⌀ legend is the last lines, after the hint line, never under the task rows
      expect(statusTail(text, statusHint())).toEqual(statusTailWant(statusHint()))
      expect(statusSection(text, 'TASKS').some(l => l.includes('✧ ='))).toBe(false)
      await writeFile(`${repo}/.symcc/board.json`, JSON.stringify({ ...statusBoard(now, true), mode: 'paused' }))
      expect(statusHeadings(await slashCommand(s, 'symcc-status', '')).includes('NEEDS YOU')).toBe(false)
    } finally {
      await closeSession(s).catch(() => undefined)
    }
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
}, 180_000)

test('T-652: a session that closes while a worker start is still on its way ends with the task back in todo and no worker running', async () => {
  const repo = await mkdtemp('/tmp/symcc-node-close-')
  const pidFile = `${repo}/.symcc/fake.pid`
  const env = { FAKE_SLEEP: process.env.FAKE_SLEEP, FAKE_PID: process.env.FAKE_PID }
  try {
    const git = (...args: string[]) => runCommand(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo })
    await git('init', '-q', '-b', 'main')
    await writeFile(`${repo}/.gitignore`, '.symcc/\n')
    await git('add', '.')
    await git('commit', '-qm', 'init')
    await enableHere(repo)
    // the fake worker, if it gets to start, waits 600 s before it writes, and leaves its process group's id
    process.env.FAKE_SLEEP = '600'
    process.env.FAKE_PID = pidFile
    const s = await openSession({ root: repo, runner: claudeRunner(nodeProcessSystem, { bin: FAKE }), say: () => undefined, sessionId: 'node-t652' })
    let closed = false
    try {
      expect(await leadTool(s, 'add', { title: 'Say hello', details: 'Done when: hello.txt says hello.', files: ['hello.txt'], why: 'a test', origin_by: 'owner' })).toContain('T-1')
      expect(await settle(s, false)).toBe(true)
      const board = async () => JSON.parse(await readFile(`${repo}/.symcc/board.json`, 'utf8')).tasks[0]
      expect((await board()).status).toBe('todo')
      // a tick's start, as settle(s, true) begins it, but the session closes as soon as the task is claimed: the start
      // is still on its way then (its worker isn't spawned or not yet known), as when a busy tick stops waiting
      s.working = true
      const started = pump(s.host).catch(() => undefined)
      for (const end = Date.now() + 120_000; (await board()).status !== 'doing' && Date.now() < end; ) await new Promise<void>(r => void setTimeout(r, 5))
      expect((await board()).status).toBe('doing')
      await closeSession(s)
      closed = true
      // right when closeSession is done (the CLI ends here): no start left, the task is back in todo, and no worker runs
      expect(starting.size).toBe(0)
      const t = await board()
      expect(t.status).toBe('todo')
      const group = Number((await readFile(pidFile, 'utf8').catch(() => '')).trim())
      if (group > 1) expect(await groupGone(group)).toBe(true)
      await started
    } finally {
      if (!closed) await closeSession(s).catch(() => undefined)
    }
  } finally {
    for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]
    else process.env[k] = v
    const group = Number((await readFile(pidFile, 'utf8').catch(() => '')).trim())
    if (group > 1) await runCommand(['sh', '-c', 'kill -s KILL -- -"$1"', 'sh', String(group)])
    await rm(repo, { recursive: true, force: true })
  }
}, 300_000)

test('T-869: a tick whose session start finishes late still starts the ready task, even when the start\'s own pump is slow', async () => {
  const repo = await mkdtemp('/tmp/symcc-node-late-')
  try {
    const git = (...args: string[]) => runCommand(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo })
    await git('init', '-q', '-b', 'main')
    await writeFile(`${repo}/.gitignore`, '.symcc/\n')
    await git('add', '.')
    await git('commit', '-qm', 'init')
    await enableHere(repo)
    let starts = 0
    // the real Claude runner on the fake `claude -p`, counting the worker starts
    const real = claudeRunner(nodeProcessSystem, { bin: FAKE })
    const runner: AgentRunner = { ...real, command: a => (starts++, real.command(a)) }
    const s = await openSession({ root: repo, runner, say: () => undefined, sessionId: 'node-t869' })
    try {
      expect(await leadTool(s, 'add', { title: 'Say hello', details: 'Done when: hello.txt says hello.', files: ['hello.txt'], why: 'a test', origin_by: 'owner' })).toContain('T-1')
      expect(await settle(s, false)).toBe(true)
      expect(starts).toBe(0)
      // as when claimLead waited (old workers from the record, the reload settle): the start isn't done when the tick
      // begins, and when it ends it fires its own pump without waiting for it, as sessionStart does. Quiet looks 1 ms
      // apart are far quicker than that pump's board read and git check, as 200 ms ones are on a busy machine
      S.startupDone = false
      const tick = settle(s, true, 120_000, 1)
      await new Promise<void>(r => void setTimeout(r, 20))
      S.startupDone = true
      void pump(s.host).catch(() => undefined)
      expect(await tick).toBe(true)
      expect(starts).toBe(1)
    } finally {
      S.startupDone = true
      await closeSession(s).catch(() => undefined)
    }
  } finally {
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

test('T-669: a Bun Worker started seconds after the process names this process with its real start time, so it is alive', async () => {
  // the worker must start well after the process (more than the 5 s slack): wait out the rest
  const late = 7_000 - process.uptime() * 1000
  if (late > 0) await new Promise<void>(r => void setTimeout(r, late))
  type BunWorker = { onmessage: unknown; onerror: unknown; terminate: () => void }
  const WorkerClass = (globalThis as unknown as { Worker: new (url: string) => BunWorker }).Worker
  const worker = new WorkerClass(import.meta.url.replace(/[^/]*$/, 'self-worker.ts'))
  const got = await new Promise<{ me?: { pid: number; started: number }; alive?: boolean; uptime: number }>((resolve, reject) => {
    worker.onmessage = (e: { data: never }) => resolve(e.data)
    worker.onerror = (e: unknown) => reject(e)
  })
  worker.terminate()
  expect(got.me?.pid).toBe(process.pid)
  expect(await nodeProcesses.alive(got.me!)).toBe(true)
  expect(got.alive).toBe(true)
  // the worker and the process name the same start time (ps counts whole seconds)
  expect(Math.abs(got.me!.started - nodeProcesses.self()!.started)).toBeLessThan(1_501)
}, 30_000)

test('T-669: a dead pid is gone at once; when ps fails, self() names no holder and alive() can not tell', async () => {
  const child = spawn('sh', ['-c', 'exit 0'], { stdio: ['ignore', 'ignore', 'ignore'] })
  await new Promise<void>(r => child.on('close', () => r()))
  let asked = 0
  const broken = nodeProcessesWith({
    runSync: () => ((asked++, { exitCode: 127, stdout: '' })),
    run: async () => ((asked++, { exitCode: 127, stdout: '', stderr: 'no ps' })),
  })
  // dead: no ps needed
  expect(await broken.alive({ pid: child.pid!, started: Date.now() })).toBe(false)
  expect(asked).toBe(0)
  expect(broken.self()).toBe(undefined)
  expect(await broken.alive({ pid: process.pid, started: Date.now() })).toBe(undefined)
  // ps that throws or prints something unreadable: can't tell either
  const odd = nodeProcessesWith({
    runSync: () => {
      throw new Error('no ps')
    },
    run: async () => ({ exitCode: 0, stdout: 'what\n', stderr: '' }),
  })
  expect(odd.self()).toBe(undefined)
  expect(await odd.alive({ pid: process.pid, started: Date.now() })).toBe(undefined)
  // self() asks ps once and keeps the answer
  let n = 0
  const counted = nodeProcessesWith({ runSync: () => ((n++, { exitCode: 0, stdout: '00:10\n' })), run: async () => ({ exitCode: 0, stdout: '00:10\n', stderr: '' }) })
  const a = counted.self()!
  expect(counted.self()).toEqual(a)
  expect(n).toBe(1)
  expect(Math.abs(Date.now() - 10_000 - a.started)).toBeLessThan(1_501)
  expect(await counted.alive(a)).toBe(true)
})

test('T-659: the Node host names this process as a board lock holder, and tells a running holder from an ended one or a reused pid', async () => {
  const me = nodeProcesses.self()!
  expect(me.pid).toBe(process.pid)
  expect(await nodeProcesses.alive(me)).toBe(true)
  // the same pid, started at another time: someone else now
  expect(await nodeProcesses.alive({ pid: me.pid, started: me.started - 3_600_000 })).toBe(false)
  // a process that ended (and was reaped)
  const child = spawn('sh', ['-c', 'exit 0'], { stdio: ['ignore', 'ignore', 'ignore'] })
  await new Promise<void>(r => child.on('close', () => r()))
  expect(await nodeProcesses.alive({ pid: child.pid!, started: Date.now() })).toBe(false)

  // a CLI run finds a fresh lock left by an ended process and takes it at once (no 30 s wait); its own lock names it
  const repo = await mkdtemp('/tmp/symcc-node-lock-')
  try {
    const git = (...args: string[]) => runCommand(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo })
    await git('init', '-q', '-b', 'main')
    await writeFile(`${repo}/.gitignore`, '.symcc/\n')
    await git('add', '.')
    await git('commit', '-qm', 'init')
    await enableHere(repo)
    await mkdir(`${repo}/.symcc`, { recursive: true })
    await writeFile(`${repo}/.symcc/board.lock`, lockText('gone:1', Date.now(), { pid: child.pid!, started: Date.now() - 1_000 }))
    const t0 = Date.now()
    const r = await runCommand(['bun', MAIN, '--root', repo, '--claude', FAKE, 'add', 'Say hello', '--files', 'hello.txt'], { cwd: repo, timeoutMs: 120_000 })
    expect(r.stdout).toContain('added T-1')
    expect(Date.now() - t0).toBeLessThan(LOCK_STALE_MS)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
}, 120_000)

test('T-474: a worker process left running by a CLI that was killed is in the record, and the next run stops it (and drops a dead entry)', async () => {
  const repo = await mkdtemp('/tmp/symcc-node-left-')
  const pidFile = `${repo}/.symcc/fake.pid`
  const recordFile = `${repo}/.symcc/${PROCESSES_FILE}`
  try {
    const git = (...args: string[]) => runCommand(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo })
    await git('init', '-q', '-b', 'main')
    await writeFile(`${repo}/.gitignore`, '.symcc/\n')
    await git('add', '.')
    await git('commit', '-qm', 'init')
    await enableHere(repo)
    // T-869: generous time limits, so a busy machine (the full test run next to `claude plugin test .`) is no failure:
    // the last tick runs a whole worker, its checks and its merge
    const cli = (...args: string[]) => runCommand(['bun', MAIN, '--root', repo, '--claude', FAKE, ...args], { cwd: repo, timeoutMs: 400_000 })
    expect((await cli('add', 'Say hello', '--files', 'hello.txt')).stdout).toContain('added T-1')

    // a tick whose worker waits 600 s; once the worker runs, the CLI is killed outright (no clean stop of its agents).
    // T-588: it runs with its cwd in a subfolder, yet its record goes next to board.json (the project folder), so the run
    // below from the top folder finds it
    await mkdir(`${repo}/sub`, { recursive: true })
    const tick = spawn('bun', [MAIN, '--root', repo, '--claude', FAKE, 'tick'], { cwd: `${repo}/sub`, env: { ...process.env, FAKE_SLEEP: '600', FAKE_PID: pidFile }, stdio: ['ignore', 'ignore', 'ignore'] })
    const tickClosed = new Promise<void>(r => tick.on('close', () => r()))
    let group = 0
    for (const end = Date.now() + 120_000; !group && Date.now() < end; await new Promise<void>(r => void setTimeout(r, 100))) {
      group = Number((await readFile(pidFile, 'utf8').catch(() => '')).trim())
    }
    expect(group).toBeGreaterThan(1)
    // the record has the worker (written when it started). T-869: the worker writes its pid itself, while the CLI
    // writes the record a moment later; wait (up to 120 s, not 10 s) until the record names this worker, so a busy
    // machine doesn't kill the CLI before it wrote it
    let entries = parseEntries(await readFile(recordFile, 'utf8').catch(() => null))
    for (const end = Date.now() + 120_000; !entries.some(e => e.pid === group) && Date.now() < end; await new Promise<void>(r => void setTimeout(r, 100))) entries = parseEntries(await readFile(recordFile, 'utf8').catch(() => null))
    // killed at any moment, maybe while it holds board.lock: T-659, the lock has the CLI's pid, so the runs below
    // take it over at once (they don't wait out LOCK_STALE_MS)
    tick.kill('SIGKILL')
    await tickClosed
    expect(entries.map(e => [e.pid, e.task, e.folder?.endsWith('/.symcc/worktrees/T-1'), e.command])).toEqual([[group, 'T-1', true, FAKE]])
    // no stray record (or any .symcc/) in the subfolder the CLI ran from
    expect((await readdir(`${repo}/sub`, { withFileTypes: true })).map(d => d.name)).toEqual([])
    expect(await groupGone(group, 500)).toBe(false)
    // plus an entry whose process ended long ago (a pid that can't be one)
    await writeFile(recordFile, entriesText([...entries, { pid: 999_999, agent: 'claude-9-old', task: 'T-9', started: '2026-01-01T00:00:00.000Z', command: FAKE }]))

    // a fresh run finds the recorded worker still alive and stops it (it never got to edit), and the record is empty
    const board = await cli('board')
    expect(board.exitCode).toBe(0)
    expect(await groupGone(group)).toBe(true)
    expect(parseEntries(await readFile(recordFile, 'utf8'))).toEqual([])
    expect(await readFile(`${repo}/.symcc/worktrees/T-1/hello.txt`, 'utf8').catch(() => 'none')).toBe('none')
    // and the task is not stuck "doing" for the stopped worker: the next tick runs it again to the end
    const again = await cli('tick')
    // exit code 124: the tick ran past cli's time limit (and was killed), not a task left stuck
    expect(again.exitCode).toBe(0)
    expect(again.stdout).toContain('1 done')
    expect(parseEntries(await readFile(recordFile, 'utf8'))).toEqual([])
  } finally {
    const group = Number((await readFile(pidFile, 'utf8').catch(() => '')).trim())
    if (group > 1) await runCommand(['sh', '-c', 'kill -s KILL -- -"$1"', 'sh', String(group)])
    await rm(repo, { recursive: true, force: true })
  }
}, 900_000)

test('T-474: processAgents records a process while it runs, and stopLeftovers leaves this copy\'s own entries alone', async () => {
  const dir = await mkdtemp('/tmp/symcc-node-rec-')
  try {
    const file = `${dir}/${PROCESSES_FILE}`
    const runner: AgentRunner = { name: 'sh', command: () => ({ argv: ['sh', '-c', 'sleep 30'] }), result: () => ({ answer: '' }) as never }
    const ended: string[] = []
    const agents = processAgents(runner, id => void ended.push(id), { system: nodeProcessSystem, record: { fs: nodeFs, file: () => file } })
    const { agentId } = await agents.spawn({ kind: 'scout', prompt: 'p', name: 'symcc-scout-bugs', description: 'd', cwd: dir })
    let entries = parseEntries(await readFile(file, 'utf8').catch(() => null))
    for (const end = Date.now() + 5000; !entries.length && Date.now() < end; await new Promise<void>(r => void setTimeout(r, 50))) entries = parseEntries(await readFile(file, 'utf8').catch(() => null))
    expect(entries.map(e => [e.agent, e.folder, e.command, e.task])).toEqual([[agentId, dir, 'sh', undefined]])
    expect(await agents.stopLeftovers()).toEqual([])
    expect(parseEntries(await readFile(file, 'utf8')).length).toBe(1)
    await agents.stopAll(1000)
    expect(ended).toEqual([agentId])
    expect(parseEntries(await readFile(file, 'utf8'))).toEqual([])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}, 60_000)

test('T-474: a recorded pid now used by another program, or by the same program started at another time, is not stopped', async () => {
  const dir = await mkdtemp('/tmp/symcc-node-reuse-')
  // an unrelated process that leads its own group and has "claude" only in an argument
  const other = spawn('sh', ['-c', 'sleep 30; true', 'x', '/Users/me/.claude/plugins/thing'], { detached: true, stdio: ['ignore', 'ignore', 'ignore'] })
  try {
    const pid = other.pid ?? 0
    expect(pid).toBeGreaterThan(1)
    const now = new Date().toISOString()
    await new Promise<void>(r => void setTimeout(r, 200))
    // "claude" in an argument is not the program; the right program started long before the entry is not it either
    expect(nodeProcessSystem.alive(pid, '/usr/local/bin/claude', now)).toBe(false)
    expect(nodeProcessSystem.alive(pid, '/bin/sh', '2020-01-01T00:00:00Z')).toBe(false)
    expect(nodeProcessSystem.alive(pid, 'sh', 'not a date')).toBe(false)
    // the same program started at the recorded time is the recorded process
    expect(nodeProcessSystem.alive(pid, 'sh', now)).toBe(true)
    expect(runsProgram('/bin/sh /x/hosts/node/tests/fake-claude.sh -p', '/x/hosts/node/tests/fake-claude.sh')).toBe(true)
    expect(runsProgram('node /usr/local/bin/claude -p', '/usr/local/bin/claude')).toBe(true)
    expect(runsProgram('vim /Users/me/.claude/settings.json', '/usr/local/bin/claude')).toBe(false)
    expect([elapsedSeconds('01:02'), elapsedSeconds('03:01:02'), elapsedSeconds('2-03:01:02'), elapsedSeconds('x')]).toEqual([62, 10862, 183662, undefined])

    const file = `${dir}/${PROCESSES_FILE}`
    await writeFile(file, entriesText([{ pid, agent: 'claude-1-old', started: '2020-01-01T00:00:00Z', command: '/usr/local/bin/claude' }]))
    const runner: AgentRunner = { name: 'none', command: () => ({ argv: ['true'] }), result: () => ({ answer: '' }) as never }
    const agents = processAgents(runner, () => undefined, { system: nodeProcessSystem, record: { fs: nodeFs, file: () => file }, leftoverGraceMs: 300 })
    expect(await agents.stopLeftovers()).toEqual([])
    // the stale entry is dropped and the unrelated process still runs
    expect(parseEntries(await readFile(file, 'utf8'))).toEqual([])
    expect(await groupGone(pid, 500)).toBe(false)
  } finally {
    try {
      if (other.pid) process.kill(-other.pid, 'SIGKILL')
    } catch {
      // gone already
    }
    await rm(dir, { recursive: true, force: true })
  }
}, 60_000)

test('T-525: on the Node host the lead (no agent id) gets its tools, and an agent id the board has no record of is refused every one of them', async () => {
  const repo = await mkdtemp('/tmp/symcc-node-lead-')
  try {
    await runCommand(['git', 'init', '-q', '-b', 'main'], { cwd: repo })
    await enableHere(repo)
    const runner: AgentRunner = { name: 'none', command: () => ({ argv: ['true'] }), result: () => ({ answer: '' }) as never }
    const s = await openSession({ root: repo, runner, say: () => undefined, sessionId: 'node-t525' })
    try {
      expect(await leadTool(s, 'add', { title: 'Lead task', details: 'Done when: a test shows it.', why: 'a test', origin_by: 'owner' })).toContain('T-1')
      for (const t of TOOLS()) {
        const r = await toolCall(s.host, toolName(t.name), 'agent-of-an-old-try', { task: 'T-1', title: 'x', details: 'y', why: 'z', origin_by: 'owner' })
        expect(r).toEqual({ deny: notLeadText(t.name) })
      }
      expect(await leadTool(s, 'board', { task: 'T-1' })).toContain('Lead task')
    } finally {
      await closeSession(s)
    }
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
}, 60_000)

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
