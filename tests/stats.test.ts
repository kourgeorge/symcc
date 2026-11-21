import { expect, test } from 'claude-code/testing'
import type { SymccTask } from '../types'
import { addScoutRun, bar, cutTitle, textWidth, parseStatsArgs, wrapLine, billedTokens, billedText, failReason, migrateScoutUsage, readArchive, archiveText, tokenCount, fmtTokenKinds, inRange, keepScoutUsage, leadTotals, mean, median, mergedHow, originKey, parseScoutMemory, parseScoutUsage, parseStatsRange, rangeSpan, scoutMemoryText, scoutTotals, statsReport, statsData, scoutResultsLine, taskFigures, readBoard, boardTotal } from '../hooks/board'
import { statsHtml } from '../hooks/core/stats-html'
import { FAILED_TESTS_SHORT, FAILED_TRIES_SHORT, durOr, failedShown, plural, tokOr } from '../hooks/core/stats'
import { leadCalls, leadUsage, projectFolderName } from '../hooks/claude/lead-usage'
import { fakeHost } from './fake-host'
import { hist } from './history-fixture'

const NOW = Date.parse('2026-11-13T12:00:00Z')
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString()

/** A task made `ageMin` minutes ago; `tries` are [minutes, tokens] per try (the tokens as plain input), each starting at the task's creation. */
function task(id: string, over: Partial<SymccTask> = {}, tries: [number, number?][] = [], ageMin = 60): SymccTask {
  const runs = tries.map(([min, tokens]) => ({ started: iso(ageMin), ended: iso(ageMin - min), ...(tokens !== undefined ? { tokens: { input: tokens } } : {}) }))
  return { id, title: `task ${id}`, details: '', files: [], status: 'done', note: '', question: null, order: 0, after: [], attempts: tries.length, history: [], branch: null, created_at: iso(ageMin), updated_at: iso(0), ...(runs.length ? { runs } : {}), ...over }
}

test('stats: averages and medians', () => {
  expect(mean([])).toBe(undefined)
  expect(mean([1, 2, 6])).toBe(3)
  expect(median([])).toBe(undefined)
  expect(median([5, 1, 3])).toBe(3)
  expect(median([4, 1, 3, 2])).toBe(2.5)
  const f = taskFigures(task('T-1', {}, [[10, 1000], [20]]), NOW)
  expect(f.ms).toBe(30 * 60_000)
  expect(f.tokens).toEqual({ input: 1000 })
  expect(f.tok).toBe(1000)
  expect(f.tries).toBe(2)
  expect(taskFigures(task('T-2')).hasData).toBe(false)
})

test('stats: per-task averages leave out tasks with no try data, and say how many', () => {
  const tasks = [task('T-1', {}, [[10, 1000]]), task('T-2', {}, [[30, 3000]]), task('T-3', {}, [[20, 2000], [20, 2000]]), task('T-4')]
  const text = statsReport({ tasks, nowMs: NOW })
  expect(text).toContain('1 task with no try data')
  expect(text).toContain('Per done task (3 done tasks with data)')
  // times 10m, 30m, 40m: avg 27m, median 30m; tokens 1k, 3k, 4k: avg 2.7k, median 3k
  expect(text).toMatch(/time\s+avg 27m · median 30m/)
  expect(text).toMatch(/tokens\s+avg 2\.7k · median 3k/)
  expect(text).toMatch(/tries\s+avg 1\.3 per task/)
  expect(text).toContain('67% of done tasks (2 of 3)')
  expect(text).not.toContain('Whole team')
  expect(text).toMatch(/with data\s+3 of 4 tasks/)
})

test('stats: archived tasks are included and said; a task on the board wins over its archived copy', () => {
  const tasks = [task('T-5', {}, [[10, 100]])]
  const archived = [task('T-1', {}, [[10, 100]], 60 * 24 * 30), task('T-5', {}, [[99, 99_999]])]
  const text = statsReport({ tasks, archived, nowMs: NOW })
  expect(text).toContain('(2 tasks, incl. 1 archived)')
  expect(text).toMatch(/worker time\s+20m/)
  expect(statsReport({ tasks, archived: [], archiveProblem: 'x is broken', nowMs: NOW })).toContain('Archived tasks are not counted: x is broken')
})

test('stats: the range is days or an id range; anything else gives the usage line', () => {
  expect(parseStatsRange('')).toEqual({ kind: 'all' })
  expect(parseStatsRange('7d')).toEqual({ kind: 'days', days: 7 })
  expect(parseStatsRange('T-130..T-100')).toEqual({ kind: 'ids', from: 100, to: 130 })
  expect(parseStatsRange('t100..130')).toEqual({ kind: 'ids', from: 100, to: 130 })
  expect(parseStatsRange('soon').kind).toBe('bad')
  expect(parseStatsRange('0d').kind).toBe('bad')
  const old = task('T-1', { updated_at: iso(60 * 24 * 10) })
  expect(inRange(old, { kind: 'days', days: 7 }, NOW)).toBe(false)
  expect(inRange(old, { kind: 'days', days: 14 }, NOW)).toBe(true)
  expect(inRange(task('T-120'), { kind: 'ids', from: 100, to: 130 }, NOW)).toBe(true)
  expect(inRange(task('T-131'), { kind: 'ids', from: 100, to: 130 }, NOW)).toBe(false)
  const text = statsReport({ tasks: [task('T-1', {}, [[5, 10]]), task('T-2', {}, [[7, 10]]), task('T-3', {}, [[9, 10]])], range: { kind: 'ids', from: 2, to: 3 }, nowMs: NOW })
  expect(text).toContain('stats · T-2..T-3 (2 tasks)')
  expect(statsReport({ tasks: [old], range: { kind: 'days', days: 7 }, nowMs: NOW })).toContain('No tasks in this range.')
})

test('stats: an empty board says so', () => {
  const text = statsReport({ tasks: [], nowMs: NOW })
  expect(text).toContain('(0 tasks)')
  expect(text).toContain('No tasks yet.')
})

test('stats: outcomes, origins and days are read from what the board keeps', () => {
  expect(failReason('try 1: did it → tests failed: `npm test` (exit 1). x')).toBe('tests')
  expect(failReason('try 2 (role docs): ok → conflicts with the latest main')).toBe('clash')
  expect(failReason('try 1: done → changed files outside the task (a.ts); allowed: b.ts')).toBe('scope')
  expect(failReason('try 3: stopped: paused by the owner')).toBe(null)
  expect(failReason('try 3: stopped from Claude Code')).toBe('stopped')
  expect(failReason('try 1: restarted: the task was changed (details)')).toBe('changed')
  // T-743: a restart symcc did itself (a reload, a reopen) is no failed try: the same try goes on
  expect(failReason('try 1: restarted: the plugin reloaded and the old worker was gone')).toBe(null)
  expect(failReason('try 2: restarted after Claude Code was reopened')).toBe(null)
  expect(failReason('try 2: worker restarted after Claude Code was reopened')).toBe(null)
  const rep = statsReport({ tasks: [{ ...knownTasks()[0]!, history: [{ at: '2026-01-01T00:00:00Z', kind: 'restarted', text: 'try 1: restarted: the task was changed (details)' }] }], nowMs: NOW })
  expect(rep).toMatch(/restarted by a change +▇+ +1/)
  expect(rep).toMatch(/ stopped +0/)
  expect(failReason('try 1: rejected by the owner: too long')).toBe('rejected')
  expect(failReason('try 1: tests failed → merged into main (abc)')).toBe(null)
  expect(failReason('moved to the backlog')).toBe(null)
  expect(mergedHow({ history: hist('try 1: x → merged into main (abc)') })).toBe('own')
  expect(mergedHow({ history: hist('try 1: x → checks passed; ready for review', 'try 1: approved by the owner → merged into main (abc); approved by the owner') })).toBe('approved')
  expect(mergedHow({ history: [] })).toBe(null)
  expect(originKey({ origin: { by: 'scout', scout: 'bugs', why: '', at: '' } })).toBe('scout bugs')
  expect(originKey({})).toBe('unknown')
  const tasks = [
    task('T-1', { history: hist('try 1: a → tests failed: x', 'try 2: b → merged into main (1)'), origin: { by: 'owner', why: 'w', at: iso(60) } }, [[10, 100], [10, 100]]),
    task('T-2', { role: 'docs', history: hist('try 1: approved by the owner → merged into main (2); approved by the owner') }, [[5, 50]]),
  ]
  const text = statsReport({ tasks, nowMs: NOW })
  expect(text).toMatch(/merged on its own +▇+ +1 +50%/)
  expect(text).toMatch(/approved by you +▇+ +1 +50%/)
  expect(text).toMatch(/tests failed +▇+ +1\n/)
  expect(text).toMatch(/clash with main +0\n/)
  expect(text).toMatch(/♟ you +▇+ +1 +50%  avg +200 tok/)
  expect(text).toMatch(/docs +▇+ +1 +50%  avg +50 tok/)
  expect(text).toMatch(/Today +▇+ +2 +25m/)
  // T-719: these histories carry no times, so the stage part leaves them out and says so
  expect(text).toContain('Time per stage (0 done tasks; 2 without timed history, left out)')
  expect(statsReport({ tasks, nowMs: NOW, full: true })).toContain('Stages: read from each done task')
})

test('stats: a try left with no end time by an older board is closed once when the board is read, so the board total and stats agree', () => {
  const t = task('T-1', { updated_at: iso(50), runs: [{ started: iso(60) }, { started: iso(58), ended: iso(55), tokens: { unsplit: 10 } }, { started: iso(54) }] })
  const read = (x: typeof t) => readBoard(JSON.stringify({ version: 1, tasks: [x] }))
  const r = read(t)
  expect(r.migrated).toBe(1)
  // 2m (to the next try) + 3m + 4m (to the last change), not 54 minutes up to now
  expect(r.board.tasks[0]!.runs!.map(x => x.ended)).toEqual([iso(58), iso(55), iso(50)])
  expect(taskFigures(r.board.tasks[0]!, NOW).ms).toBe(9 * 60_000)
  expect(boardTotal(r.board, NOW).ms).toBe(9 * 60_000)
  expect(statsReport({ tasks: r.board.tasks, nowMs: NOW })).not.toContain('no end time')
  // a running task's last try is left open and counts up to now
  const doing = read({ ...t, status: 'doing' }).board.tasks[0]!
  expect(doing.runs!.at(-1)!.ended).toBeUndefined()
  expect(taskFigures(doing, NOW).ms).toBe((2 + 3 + 54) * 60_000)
})

/** One assistant line of a Claude Code session log, with only what leadCalls reads (plus a content block it must ignore). */
const logLine = (id: string, minAgo: number, u: { i?: number; o?: number; cr?: number; cc?: number }, over: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'assistant', isSidechain: false, timestamp: iso(minAgo), message: { id, model: 'm', content: [{ type: 'text', text: 'secret words' }], usage: { input_tokens: u.i ?? 0, output_tokens: u.o ?? 0, cache_read_input_tokens: u.cr ?? 0, cache_creation_input_tokens: u.cc ?? 0 } }, ...over })

test('stats: a scout run adds its tokens and time to scouts.json, and the rest of the file is kept', () => {
  const mem = scoutMemoryText([{ name: 'bugs', last_run: iso(5), last_report: 'all fine' }])
  let text = addScoutRun(mem, 'bugs', { endMs: NOW, ms: 120_000, tokens: { input: 1000, output: 500, cache_write: 500, cache_read: 3000 } })
  text = addScoutRun(text, 'bugs', { endMs: NOW - 86_400_000 * 3, ms: 60_000 })
  text = addScoutRun(text, 'docs', { endMs: NOW, ms: 30_000, tokens: { input: 700 } })
  expect(parseScoutMemory(text).bugs?.last_report).toBe('all fine')
  const u = parseScoutUsage(text)
  // each kind is kept apart, not one sum
  expect(u.bugs).toMatchObject({ runs: 2, tokens: { input: 1000, output: 500, cache_write: 500, cache_read: 3000 }, ms: 180_000 })
  expect(u.bugs!.days['2026-11-13']).toEqual({ runs: 1, tokens: { input: 1000, output: 500, cache_write: 500, cache_read: 3000 }, ms: 120_000 })
  expect(u.docs?.tokens).toEqual({ input: 700 })
  // a later save of the scouts' memory (which knows nothing of usage) keeps it
  const saved = keepScoutUsage(scoutMemoryText([{ name: 'bugs', last_run: iso(1), last_report: 'new' }]), text)
  expect(parseScoutUsage(saved)).toEqual(u)
  expect(parseScoutMemory(saved).bugs?.last_report).toBe('new')
  expect(parseScoutUsage('not json')).toEqual({})
  // the range: the last 2 days leave out the run 3 days ago
  const both = { input: 1700, output: 500, cache_write: 500, cache_read: 3000 }
  expect(scoutTotals(u, {})).toEqual({ runs: 3, tokens: both, ms: 210_000 })
  expect(scoutTotals(u, rangeSpan({ kind: 'days', days: 2 }, [], NOW))).toEqual({ runs: 2, tokens: both, ms: 150_000 })
})

test('stats: the lead is summed from session log lines, each call once, main chat only', () => {
  const jsonl = [
    logLine('a', 10, { i: 2, o: 80, cr: 900, cc: 18 }),
    logLine('a', 10, { i: 2, o: 98, cr: 900, cc: 18 }), // the same call, written again with its final count
    logLine('b', 60 * 24 * 5, { i: 1000 }),
    logLine('c', 5, { i: 500 }, { isSidechain: true }),
    JSON.stringify({ type: 'user', message: { content: 'hi', usage: { input_tokens: 9 } } }),
    'broken {',
    '',
  ].join('\n')
  const calls = leadCalls(jsonl)
  expect(calls.length).toBe(2)
  // each kind kept apart: input, output, cache writes (cache_creation) and cache reads
  expect(leadTotals(calls, {})).toEqual({ calls: 2, tokens: { input: 1002, output: 98, cache_write: 18, cache_read: 900 } })
  expect(leadTotals(calls, rangeSpan({ kind: 'days', days: 1 }, [], NOW))).toEqual({ calls: 1, tokens: { input: 2, output: 98, cache_write: 18, cache_read: 900 } })
  expect(projectFolderName('/Users/me/repos/my.app')).toBe('-Users-me-repos-my-app')
})

test('stats: a session log over 4 MiB is read in parts, and one that still cannot be read is named (T-762)', async () => {
  const MiB = 1024 * 1024
  const dir = '/home/me/.claude/projects/-repo'
  const pad = (n: number) => JSON.stringify({ type: 'user', message: { content: 'x'.repeat(Math.max(0, n - 40)) } })
  // a big log: one call early, one cut across the 3 MiB line between two parts, one near the end; over 4 MiB in all
  const first = logLine('big-1', 10, { i: 1000 })
  const cut = logLine('big-2', 10, { i: 20_000 })
  const head = [first, pad(3 * MiB - first.length - 2 - 60)].join('\n') + '\n'
  const big = [head + cut, pad(2 * MiB), logLine('big-3', 10, { i: 300_000 }), ''].join('\n')
  expect(big.length > 4 * MiB).toBe(true)
  expect(head.length < 3 * MiB && head.length + cut.length > 3 * MiB).toBe(true)
  const files = new Map([[`${dir}/small.jsonl`, logLine('s', 10, { i: 4 })], [`${dir}/big.jsonl`, big]])
  const runs: string[][] = []
  const { host } = fakeHost({
    env: async k => (k === 'HOME' ? '/home/me' : undefined),
    fs: {
      list: async () => [...files].map(([p, t]) => ({ name: p.slice(dir.length + 1), kind: 'file' as const, size: t.length, mtimeMs: NOW, isLink: false })),
      // as Claude Code's $.fs.read: a file over 4 MiB is refused
      read: async p => { const t = files.get(p)!; if (t.length > 4 * MiB) throw new Error('over 4 MiB'); return t },
    },
    // dd if=<path> bs=1048576 skip=<k> count=<n>, over the text as bytes (it is all ASCII here)
    run: async argv => {
      runs.push([...argv])
      const arg = (k: string) => argv.find(a => a.startsWith(`${k}=`))!.slice(k.length + 1)
      const t = files.get(arg('if'))!
      const at = Number(arg('skip')) * MiB
      return { exitCode: 0, stdout: t.slice(at, at + Number(arg('count')) * MiB), stderr: '' }
    },
  })
  const u = await leadUsage(host, '/repo', { kind: 'all' }, NOW)
  expect(u.leadSessions).toBe(2)
  expect(u.leadUnread).toBe(undefined)
  const lt = leadTotals(u.lead!, {})
  expect(lt.calls).toBe(4)
  expect(tokenCount(lt.tokens)).toBe(321_004)
  // only the big log goes through dd, its path as one argument
  expect(runs.every(a => a[0] === 'dd' && a[1] === `if=${dir}/big.jsonl`)).toBe(true)
  const tasks = [task('T-1', {}, [[10, 1000]])]
  expect(statsReport({ tasks, nowMs: NOW, team: u })).toMatch(/lead\s+▇+\s+321k tokens · 4 calls · 2 sessions\n/)

  // when the parts can't be read either, the lead's row says so (text and HTML)
  const { host: failing } = fakeHost({ env: host.env, fs: host.fs, run: async () => ({ exitCode: 1, stdout: '', stderr: 'no dd' }) })
  const v = await leadUsage(failing, '/repo', { kind: 'all' }, NOW)
  expect(v.leadUnread).toBe(1)
  expect(leadTotals(v.lead!, {}).calls).toBe(1)
  const text = statsReport({ tasks, nowMs: NOW, team: v })
  expect(text).toMatch(/lead\s+▂\s+4 tokens · 1 call · 1 session · 1 session\s+log too big to read/)
  expect(statsHtml(statsData({ tasks, nowMs: NOW, team: v }), 'p')).toContain('1 call · 1 session · 1 session log too big to read')
  // no log read at all: still named next to "not counted"
  expect(statsReport({ tasks, nowMs: NOW, team: { leadProblem: 'no logs', leadUnread: 2 } })).toMatch(/not counted: no logs · 2 session\s+logs too big to read/)
})

test('stats: a big log is read on a host with the real $.process.run limits, after the session moved to a removed folder (T-778)', async () => {
  const MiB = 1024 * 1024
  const dir = '/home/me/.claude/projects/-repo'
  const pad = (n: number) => JSON.stringify({ type: 'user', message: { content: 'x'.repeat(Math.max(0, n - 40)) } })
  const big = [logLine('b-1', 10, { i: 1000 }), pad(5 * MiB), logLine('b-2', 10, { i: 20_000 }), pad(4 * MiB), logLine('b-3', 10, { i: 300_000 }), ''].join('\n')
  const folders = new Set(['/home/me', dir, '/repo'])
  const runs: { argv: string[]; cwd?: string }[] = []
  const { host } = fakeHost({
    env: async k => (k === 'HOME' ? '/home/me' : undefined),
    fs: {
      list: async () => [{ name: 'big.jsonl', kind: 'file' as const, size: big.length, mtimeMs: NOW, isLink: false }],
      read: async () => { throw new Error('over 4 MiB') },
    },
    // as Claude Code's $.process.run (.claude-plugin/types/claude-code/index.d.ts): with no cwd the session's working
    // folder is used (here a removed worktree: the command can't start, ENOENT); timeoutMs at most ten minutes, 30 s by
    // default; stdout cut at 4194304 bytes with isStdoutTruncated
    run: async (argv, init) => {
      runs.push({ argv: [...argv], cwd: init?.cwd })
      const cwd = init?.cwd ?? '/repo/.symcc/worktrees/T-1'
      if (!folders.has(cwd)) throw new Error(`ENOENT: no such file or directory, posix_spawn '${argv[0]}' (cwd ${cwd})`)
      if ((init?.timeoutMs ?? 30_000) > 600_000) throw new Error('timeoutMs over ten minutes')
      const arg = (k: string) => argv.find(a => a.startsWith(`${k}=`))!.slice(k.length + 1)
      const bs = Number(arg('bs'))
      const at = Number(arg('skip')) * bs
      const out = big.slice(at, at + Number(arg('count')) * bs)
      const cap = 4194304
      return { exitCode: 0, stdout: out.slice(0, cap), stderr: '', isStdoutTruncated: out.length > cap, isStderrTruncated: false }
    },
  })
  const u = await leadUsage(host, '/repo', { kind: 'days', days: 1 }, NOW)
  expect(u.leadUnread).toBe(undefined)
  expect(u.leadSessions).toBe(1)
  expect(tokenCount(leadTotals(u.lead!, {}).tokens)).toBe(321_000)
  expect(runs.length > 3).toBe(true)
  expect(runs.every(r => r.cwd === dir)).toBe(true)
})

test('stats: the whole team adds up lead, workers and scouts, and gives tokens per merged task', () => {
  const tasks = [task('T-1', {}, [[10, 1000]]), task('T-2', {}, [[10, 3000]]), task('T-3', { status: 'doing' }, [[5, 1000]])]
  const lead = leadCalls([logLine('a', 10, { i: 4000 }), logLine('b', 60 * 24 * 20, { i: 90_000 })].join('\n'))
  const scouts = parseScoutUsage(addScoutRun(null, 'bugs', { endMs: NOW, ms: 60_000, tokens: { input: 2000 } }))
  const text = statsReport({ tasks, nowMs: NOW, team: { lead, leadSessions: 1, scouts, sessionUsd: 1.5 } })
  expect(text).toContain('Whole team (all time)')
  expect(text).toMatch(/◆ lead +▇{16} +94k tokens · 2 calls · 1 session\n/)
  expect(text).toMatch(/▸ workers +▇ +5k tokens · 3 tries/)
  expect(text).toMatch(/⌕ scouts +▂ +2k tokens · 1 run · 1m/)
  expect(text).toMatch(/total\s+101k in all, about 101k billed\*/)
  expect(text).toMatch(/per merged\s+50\.5k in all, about 50\.5k billed per merged task \(2 merged\)/)
  expect(text).toContain("symcc doesn't know the model prices (this session so")
  expect(text).toContain('$1.50')
  expect(statsReport({ tasks, nowMs: NOW, full: true, team: { lead, leadSessions: 1, scouts } })).toMatch(/1 session, from Claude\s+Code's session logs/)
  // the last 7 days: the lead's call 20 days ago is left out
  const week = statsReport({ tasks, range: { kind: 'days', days: 7 }, nowMs: NOW, team: { lead, scouts } })
  expect(week).toContain('Whole team (the last 7 days)')
  expect(week).toMatch(/lead\s+▇{12}▅\s+4k tokens · 1 call/)
  expect(week).toMatch(/total\s+11k in all/)
  // no logs: the lead is said to be left out, the rest still adds up
  const none = statsReport({ tasks, nowMs: NOW, team: { leadProblem: 'no session logs in ~/x' } })
  expect(none).toContain('not counted: no session logs in ~/x')
  expect(none).toMatch(/total\s+5k in all, about 5k billed\* \(without the lead\)/)
})

test('stats: an id range counts the lead and scouts over the time its tasks span', () => {
  const tasks = [task('T-1', { updated_at: iso(60 * 24 * 9) }, [[10, 1000]], 60 * 24 * 10), task('T-2', {}, [[10, 3000]])]
  const lead = leadCalls([logLine('old', 60 * 24 * 9.5, { i: 700 }), logLine('new', 10, { i: 9000 })].join('\n'))
  const text = statsReport({ tasks, range: { kind: 'ids', from: 1, to: 1 }, nowMs: NOW, team: { lead } })
  expect(text).toContain('Whole team (T-1..T-1; lead and scouts over the time these tasks span)')
  expect(text).toMatch(/lead\s+▇+▂?\s+700 tokens · 1 call/)
  expect(text).toMatch(/total\s+1.7k in all/)
})

test('stats: a worker try keeps its kinds apart, and the report shows them with a billed-equivalent estimate', () => {
  const t = task('T-1', { runs: [{ started: iso(60), ended: iso(50), tokens: { input: 1000, output: 2000, cache_write: 4000, cache_read: 100_000 } }] })
  const team = { lead: leadCalls(logLine('a', 10, { i: 10, o: 20, cr: 1000, cc: 40 })) }
  const text = statsReport({ tasks: [t], nowMs: NOW, team })
  // the summary: tokens in plain words, the kinds on one line under, and a short footnote for billed
  expect(text).toMatch(/tokens\s+107k in all, about 26k billed\*\n\s+input 1k · output 2k · cache write 4k · cache read 100k\n/)
  expect(text).toContain('* billed (an estimate): input ×1, output ×5, cache write ×1.25, cache read ×0.1')
  expect(text).not.toContain('an estimate: each kind weighed')
  // the whole team: each part and the total with their kinds
  expect(text).toMatch(/lead\s+▂\s+1.1k tokens · 1 call\n\s+input 10 · output 20 · cache write 40 · cache read 1k/)
  expect(text).toMatch(/workers\s+▇{16}\s+107k tokens · 1 try\n\s+input 1k · output 2k · cache write 4k · cache read 100k/)
  expect(text).toMatch(/total\s+108.1k in all, about 26\.3k billed\*\n\s+input 1k · output 2k · cache write 4k · cache read 101k/)
  // the full view adds the long billed-equivalent lines
  const fullText = statsReport({ tasks: [t], nowMs: NOW, team, full: true })
  expect(fullText).toMatch(/billed-eq\.\s+26k \(an estimate: each kind weighed by its usual price compared\n\s+with input \(input 1, cache write 1\.25, cache read 0\.1, output 5\)\)/)
  expect(fullText).toMatch(/billed-eq\.\s+26\.3k \(an estimate/)
})

test('stats: the billed-equivalent weighs input 1, cache write 1.25, cache read 0.1 and output 5, and leaves out unsplit tokens', () => {
  expect(billedTokens({ input: 1000, output: 100, cache_write: 400, cache_read: 10_000 })).toBe(1000 + 500 + 500 + 1000)
  expect(billedTokens({})).toBe(0)
  expect(billedTokens({ input: 10, unsplit: 5000 })).toBe(10)
  expect(tokenCount({ input: 10, output: 1, cache_write: 2, cache_read: 3, unsplit: 4 })).toBe(20)
  expect(billedText({ input: 1000, unsplit: 2000 })).toMatch(/^1k \(an estimate: .*; leaves out 2k unsplit tokens, saved before the kinds were kept apart\)$/)
  expect(fmtTokenKinds({ cache_read: 5, unsplit: 7, input: 1 })).toBe('input 1 · cache read 5 · unsplit 7')
})

test('stats: old saved runs with one number are migrated once, kept as-is and shown as unsplit', () => {
  // board.json: a try's tokens and the archived totals
  const old = { ...task('T-1', { runs: [] }), runs: [{ started: iso(60), ended: iso(50), tokens: 5000 }, { started: iso(40), ended: iso(30), tokens: { input: 10 } }] }
  const r = readBoard(JSON.stringify({ version: 1, tasks: [old], archived: { done: 1, dropped: 0, tries: 1, ms: 60_000, tokens: 300 } }))
  expect(r.migrated).toBe(2)
  expect(r.board.tasks[0]!.runs!.map(x => x.tokens)).toEqual([{ unsplit: 5000 }, { input: 10 }])
  expect(r.board.archived!.tokens).toEqual({ unsplit: 300 })
  expect(readBoard(JSON.stringify(r.board)).migrated).toBe(0)
  const text = statsReport({ tasks: r.board.tasks, nowMs: NOW })
  expect(text).toMatch(/tokens\s+5k in all, about 10 billed\* \(leaves out 5k unsplit\)\n\s+input 10 · unsplit 5k\n/)
  expect(statsReport({ tasks: r.board.tasks, nowMs: NOW, full: true })).toMatch(/billed-eq\.\s+10 \([^]*leaves out 5k unsplit tokens/)
  // archive.json: its tasks' tries too
  const a = readArchive(JSON.stringify({ version: 1, tasks: [{ ...old, status: 'done' }] }))
  expect(a.migrated).toBe(1)
  expect(a.archive.tasks[0]!.runs![0]!.tokens).toEqual({ unsplit: 5000 })
  expect(readArchive(archiveText(a.archive)).migrated).toBeUndefined()
  // scouts.json: the usage totals, all and per day
  const scouts = JSON.stringify({ scouts: {}, usage: { bugs: { runs: 2, tokens: 900, ms: 10, days: { '2026-11-13': { runs: 1, tokens: 400, ms: 5 } } } } })
  const moved = migrateScoutUsage(scouts)!
  expect(parseScoutUsage(moved).bugs).toEqual({ runs: 2, tokens: { unsplit: 900 }, ms: 10, days: { '2026-11-13': { runs: 1, tokens: { unsplit: 400 }, ms: 5 } } })
  expect(migrateScoutUsage(moved)).toBe(null)
  expect(migrateScoutUsage(addScoutRun(moved, 'bugs', { endMs: NOW, ms: 1, tokens: { input: 1 } }))).toBe(null)
  expect(parseScoutUsage(addScoutRun(moved, 'bugs', { endMs: NOW, ms: 1, tokens: { input: 1 } })).bugs!.tokens).toEqual({ input: 1, unsplit: 900 })
})

test('stats: a bar is scaled to the biggest value, at most 16 blocks, and a small value still shows', () => {
  expect(bar(16, 16)).toBe('▇'.repeat(16))
  expect(bar(8, 16)).toBe('▇'.repeat(8))
  expect(bar(1, 3)).toBe('▇▇▇▇▇▂') // 5.33 blocks
  expect(bar(2, 3)).toBe('▇▇▇▇▇▇▇▇▇▇▅') // 10.67 blocks
  expect(bar(1, 1000)).toBe('▂')
  expect(bar(0, 10)).toBe('')
  expect(bar(5, 0)).toBe('')
  expect(bar(20, 10)).toBe('▇'.repeat(16))
  expect(bar(3, 4, 8)).toBe('▇'.repeat(6))
})

test('stats: "full" anywhere in the words asks for the full view; the rest is the range', () => {
  expect(parseStatsArgs('')).toEqual({ full: false, html: false, inside: false, range: '' })
  expect(parseStatsArgs('full')).toEqual({ full: true, html: false, inside: false, range: '' })
  expect(parseStatsArgs('7d FULL')).toEqual({ full: true, html: false, inside: false, range: '7d' })
  expect(parseStatsArgs('full T-1..T-9')).toEqual({ full: true, html: false, inside: false, range: 'T-1..T-9' })
  expect(parseStatsArgs('2d inside')).toEqual({ full: false, html: false, inside: true, range: '2d' })
})

test('stats: a long line is wrapped under its text, within 80 columns', () => {
  const l = `  dollars      ${'word '.repeat(30)}`
  const w = wrapLine(l)
  expect(w.length).toBeGreaterThan(1)
  for (const x of w) expect(x.length).toBeLessThanOrEqual(80)
  expect(w[1]!.startsWith(' '.repeat(15) + 'word')).toBe(true)
  expect(wrapLine('short')).toEqual(['short'])
})

/** Five tasks with known origins, roles, outcomes and days, for the bar charts. */
function knownTasks(): SymccTask[] {
  const scout = (s: string) => ({ origin: { by: 'scout' as const, scout: s, why: '', at: '' } })
  const merged = { history: hist('try 1: x → merged into main (1)') }
  return [
    task('T-1', { ...merged, origin: { by: 'lead', why: '', at: '' } }, [[10, 1000]]),
    task('T-2', { ...merged, origin: { by: 'lead', why: '', at: '' } }, [[20, 2000]]),
    task('T-3', { ...merged, origin: { by: 'owner', why: '', at: '' }, role: 'docs' }, [[30, 4000]]),
    task('T-4', { history: hist('try 1: x → tests failed: y', 'try 2: approved by the owner → merged into main (2); approved by the owner'), ...scout('gaps-bot') }, [[40, 8000], [5, 0]]),
    task('T-5', { status: 'todo', ...scout('test-gaps'), updated_at: iso(60 * 24 * 2) }),
  ]
}

test('stats: the summary view shows bars with counts and percentages for a known set of tasks', () => {
  const text = statsReport({ tasks: knownTasks(), nowMs: NOW, team: { leadProblem: 'no logs' } })
  const lines = text.split('\n')
  // the one-line summary
  expect(lines[2]).toBe('4 done · 1h 45m of work · 15k tokens · 75% right first try')
  // by status: 4 done is the biggest (16 blocks), 1 to do is a quarter (4 blocks)
  expect(text).toContain(`  done         ${'▇'.repeat(16)}    4  80%`)
  expect(text).toContain(`  to do        ${'▇'.repeat(4).padEnd(16)}    1  20%`)
  // where tasks came from: lead 2, all scouts 2 (each scout on its own line), you 1
  expect(text).toMatch(/◆ lead +▇{16} +2 +40%  avg +1\.5k tok · +15m/)
  expect(text).toMatch(/⌕ all scouts +▇{16} +2 +40%/)
  expect(text).toMatch(/\n {6}gaps-bot +▇{8} +1 +20%/)
  expect(text).toMatch(/\n {6}test-gaps +▇{8} +1 +20%/)
  expect(text).toMatch(/♟ you +▇{8} +1 +20%/)
  // how tasks ended and failed tries
  expect(text).toMatch(/merged on its own +▇{16} +3 +75%/)
  expect(text).toMatch(/approved by you +▇{5}▂ +1 +25%/)
  // the biggest tasks by tokens: T-4 biggest, T-1 an eighth
  expect(text).toMatch(/Most tokens\n {2}T-4 +task T-4 +▇{16} +8k\n {2}T-3 +task T-3 +▇{8} +4k/)
  expect(text).toMatch(/\n {2}T-1 +task T-1 +▇{2} +1k\n/)
  // the days: oldest first, today last
  expect(text).toMatch(/Today +▇{16} +4 +1h 45m · +15k tokens/)
  for (const l of lines) expect(l.length).toBeLessThanOrEqual(80)
})

test('stats: the summary keeps every figure of the full view; full only adds the explanations', () => {
  const lead = leadCalls([logLine('a', 10, { i: 4000, o: 10, cr: 90_000, cc: 50 })].join('\n'))
  const scouts = parseScoutUsage(addScoutRun(null, 'gaps-bot', { endMs: NOW, ms: 60_000, tokens: { input: 2000 } }))
  const input = { tasks: knownTasks(), nowMs: NOW, team: { lead, leadSessions: 3, scouts, sessionUsd: 2.25 } }
  const short = statsReport(input)
  const full = statsReport({ ...input, full: true })
  for (const want of ['4 done', 'to do ', 'worker time  1h 45m', 'with data    4 of 5 tasks', '1 call · 3 sessions', '5 tries', '1 run · 1m', 'per merged', '$2.25',
    'avg 26m · median 25m · total 1h 45m', 'avg 3.8k · median 3k · total 15k (in all)', 'avg 1.3 per task', '75% of done tasks (3 of 4)', 'lead time    avg 1h 00m · median 1h 00m · total 4h 00m (made to done, 4 tasks)',
    'avg 21m · total 1h 45m', 'avg 3k in all · total 15k', 'Most time', 'input 4k · output 10 · cache write 50 · cache read 90k', 'Failed tries (1, from history)']) {
    expect(short).toContain(want)
    expect(full).toContain(want)
  }
  expect(full).toContain('billed-eq.')
  expect(full).toMatch(/from Claude\s+Code's session logs/)
  expect(short).toContain('Every detail: /symcc-stats full')
  for (const l of [...short.split('\n'), ...full.split('\n')]) expect(l.length).toBeLessThanOrEqual(80)
})

test('stats: zero tasks shows a clear "no tasks yet" line, in both views', () => {
  expect(statsReport({ tasks: [], nowMs: NOW })).toBe('symcc stats · all tasks (0 tasks)\n\nNo tasks yet.')
  expect(statsReport({ tasks: [], nowMs: NOW, full: true })).toContain('No tasks yet.')
})

test('stats: wide titles (Japanese, emoji) are cut and padded by screen width, never splitting a character', () => {
  expect(textWidth('abc')).toBe(3)
  expect(textWidth('日本語')).toBe(6)
  expect(textWidth('🚀🎉')).toBe(4)
  expect(cutTitle('a'.repeat(40))).toBe(`${'a'.repeat(34)}…`)
  expect(cutTitle('short title')).toBe('short title')
  const jp = 'データベースの接続をもっと速くして、ログに残すようにする'
  const emoji = '🚀 launch 🎉 party 👨‍👩‍👧 family 🐛 bug fix 🔥🔥🔥🔥🔥🔥🔥🔥'
  for (const t of [jp, emoji]) {
    const c = cutTitle(t)
    expect(textWidth(c)).toBeLessThanOrEqual(35)
    expect(c.endsWith('…')).toBe(true)
    expect(t.startsWith(c.slice(0, -1))).toBe(true)
    expect(c).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|\u200D…/)
  }
  const tasks = [task('T-1', { title: jp }, [[30, 8000]]), task('T-2', { title: emoji }, [[20, 4000]]), task('T-3', {}, [[10, 1000]])]
  const text = statsReport({ tasks, nowMs: NOW })
  expect(text).not.toContain('\uFFFD')
  const rows = text.split('\n').filter(l => /^ {2}T-[123] /.test(l))
  expect(rows.length).toBe(6)
  for (const l of text.split('\n')) expect(textWidth(l)).toBeLessThanOrEqual(80)
  // the bars start at the same screen column in every row
  for (const l of rows) expect(textWidth(l.slice(0, l.indexOf('▇')))).toBe(2 + 6 + 1 + 35 + 1)
})

test('stats: investigations end "answered", are counted on their own, and stay out of the done, first-try and merge figures', () => {
  const inv = (id: string, over: Partial<SymccTask>, tries: [number, number?][]) => {
    const t = task(id, { kind: 'investigation', role: 'researcher', ...over } as Partial<SymccTask>, tries)
    return { ...t, runs: t.runs?.map(r => ({ ...r, ended_by: 'finished' as const, ended_note: 'answered' })) }
  }
  expect(mergedHow({ kind: 'investigation', history: hist('try 1: the owner read the answer → done (nothing merged)') })).toBe('answered')
  const tasks = [
    ...knownTasks(),
    inv('T-6', { history: hist('try 1: answered: x', 'try 1: the owner read the answer → done (nothing merged)') }, [[10, 3000], [20, 5000]]),
    inv('T-7', { status: 'review', history: hist('try 1: answered: y') }, [[30, 2000]]),
  ]
  for (const full of [false, true]) {
    const text = statsReport({ tasks, nowMs: NOW, full, team: { leadProblem: 'no logs' } })
    // the summary: still 4 done change tasks, 75% right first try (T-6 took two tries but is not counted)
    expect(text.split('\n')[2]).toBe('4 done · 2 answered · 2h 45m of work · 25k tokens · 75% right first try')
    expect(text).toContain('Investigations (2, 2 answered; not in done, first-try or merge figures)')
    expect(text).toContain('  answered     2 of 2 (1 read by you, 1 waiting to be read)')
    expect(text).toContain('  time         1h 00m in all · avg 30m per investigation')
    expect(text).toContain('  tokens       10k in all · avg 5k per investigation')
    expect(text).toContain('  tries        3 in all · avg 1.5 per investigation')
    expect(text).toContain('75% of done tasks (3 of 4)')
    expect(text).toContain('Per done task (4 done tasks with data, investigations left out)')
    expect(text).toMatch(/How tasks ended \(5 done tasks\)/)
    expect(text).toMatch(/answered \(investigation\) +[▇▅▂]+ +1 +20%/)
    expect(text).not.toContain('not clear from history')
    // the most tokens list is of change tasks only
    expect(text).not.toMatch(/Most tokens[^]*T-6/)
    for (const l of text.split('\n')) expect(l.length).toBeLessThanOrEqual(80)
  }
  const none = statsReport({ tasks: knownTasks(), nowMs: NOW })
  expect(none).toContain('Investigations (0, 0 answered;')
  expect(none.split('\n')[2]).toBe('4 done · 1h 45m of work · 15k tokens · 75% right first try')
})

/** T-622: two scouts: bugs (one merged, one dropped, two open incl. backlog) and secrets (one open, none merged). */
function scoutTasks(): SymccTask[] {
  const scout = (s: string) => ({ origin: { by: 'scout' as const, scout: s, why: '', at: '' } })
  return [
    task('T-1', { ...scout('bugs'), history: hist('try 1: x → merged into main (1)') }, [[10, 4000]]),
    task('T-2', { ...scout('bugs'), status: 'dropped' }, [[5, 500]]),
    task('T-3', { ...scout('bugs'), status: 'backlog' }),
    task('T-4', { ...scout('bugs'), status: 'todo' }),
    task('T-5', { ...scout('secrets'), status: 'todo' }),
    task('T-6', { origin: { by: 'lead', why: '', at: '' } }, [[10, 1000]]),
  ]
}
const scoutUsage = () => {
  let text = addScoutRun(null, 'bugs', { endMs: NOW, ms: 60_000, tokens: { input: 2000 } })
  text = addScoutRun(text, 'bugs', { endMs: NOW - 30 * 86_400_000, ms: 60_000, tokens: { input: 1000 } })
  text = addScoutRun(text, 'secrets', { endMs: NOW, ms: 60_000, tokens: { input: 6000 } })
  text = addScoutRun(text, 'quiet', { endMs: NOW, ms: 60_000, tokens: { input: 1000 } })
  return parseScoutUsage(text)
}

test('stats: each scout shows its tasks merged / dropped / open, its tokens and tokens per merged task (T-622)', () => {
  const text = statsReport({ tasks: scoutTasks(), nowMs: NOW, range: { kind: 'days', days: 7 }, team: { leadProblem: 'no logs', scouts: scoutUsage() } })
  // bugs: (2k scout tokens this week + 4k for the merged T-1) / 1 merged
  expect(text).toMatch(/\n {6}bugs +[▇▅▂]+ +4 +67%.*\n {8}4 tasks \(1 merged, 1 dropped, 2 open\) · 2k scout tokens · 6k per merged\n/)
  expect(text).toMatch(/\n {6}secrets +[▇▅▂]+ +1 +17%.*\n {8}1 task \(0 merged, 0 dropped, 1 open\) · 6k scout tokens · — per merged\n/)
  // a scout that used tokens but made no task is listed too
  expect(text).toMatch(/\n {6}quiet +0 +0%\n {8}no tasks · 1k scout tokens · — per merged\n/)
  // in all: bugs' older run counts too
  expect(statsReport({ tasks: scoutTasks(), nowMs: NOW, team: { scouts: scoutUsage() } })).toContain('4 tasks (1 merged, 1 dropped, 2 open) · 3k scout tokens · 7k per merged')
  for (const l of text.split('\n')) expect(l.length).toBeLessThanOrEqual(80)
})

test("stats: a scout's page Results line gives the same numbers for the last 7 days and in all (T-622)", () => {
  const old = task('T-0', { origin: { by: 'scout', scout: 'bugs', why: '', at: '' }, history: hist('try 1: x → merged into main (1)'), updated_at: iso(60 * 24 * 30) }, [[10, 2000]], 60 * 24 * 31)
  const tasks = [old, ...scoutTasks()]
  const u = scoutUsage()
  const week = statsReport({ tasks, nowMs: NOW, range: { kind: 'days', days: 7 }, team: { scouts: u } })
  const line = scoutResultsLine(tasks, 'bugs', u.bugs, NOW)
  expect(line).toBe('last 7 days: 4 tasks (1 merged, 1 dropped, 2 open) · 2k scout tokens · 6k per merged\nin all: 5 tasks (2 merged, 1 dropped, 2 open) · 3k scout tokens · 4.5k per merged')
  // the page's week part matches /stats 7d
  expect(week).toContain('4 tasks (1 merged, 1 dropped, 2 open) · 2k scout tokens · 6k per merged')
  expect(scoutResultsLine(tasks, 'secrets', u.secrets, NOW)).toBe('last 7 days: 1 task (0 merged, 0 dropped, 1 open) · 6k scout tokens · — per merged\nin all: 1 task (0 merged, 0 dropped, 1 open) · 6k scout tokens · — per merged')
  expect(scoutResultsLine([], 'new', undefined, NOW)).toBe('last 7 days: no tasks · 0 scout tokens · — per merged\nin all: no tasks · 0 scout tokens · — per merged')
})

test('stats: with no scouts the report says nothing extra about scouts (T-622)', () => {
  const tasks = scoutTasks().filter(t => t.origin?.by !== 'scout')
  const text = statsReport({ tasks, nowMs: NOW, team: { leadProblem: 'no logs', scouts: {} } })
  expect(text).not.toContain('scout tokens')
  expect(text).not.toContain('all scouts')
  expect(statsReport({ tasks, nowMs: NOW })).not.toContain('scout tokens')
})

test('stats: scouts named like built-in object names (constructor, toString, __proto__) work (T-622)', () => {
  const names = ['constructor', 'toString', 'valueOf', '__proto__']
  const tasks = names.map((s, i) => task(`T-${i + 1}`, { origin: { by: 'scout', scout: s, why: '', at: '' }, status: 'todo' }))
  for (const range of [{ kind: 'days' as const, days: 7 }, undefined]) {
    const text = statsReport({ tasks, nowMs: NOW, ...(range ? { range } : {}), team: { scouts: {} } })
    expect(text).not.toContain('NaN')
    expect(text).toContain('1 task (0 merged, 0 dropped, 1 open) · 0 scout tokens · — per merged')
  }
  const empty = parseScoutUsage(null)
  for (const s of names) expect(scoutResultsLine(tasks, s, Object.hasOwn(empty, s) ? empty[s] : undefined, NOW)).toContain('last 7 days: 1 task (0 merged, 0 dropped, 1 open) · 0 scout tokens')
  // a scout really named __proto__ keeps its own usage
  const u = parseScoutUsage(addScoutRun(null, '__proto__', { endMs: NOW, ms: 1000, tokens: { input: 3000 } }))
  expect(Object.hasOwn(u, '__proto__')).toBe(true)
  expect(statsReport({ tasks, nowMs: NOW, range: { kind: 'days', days: 7 }, team: { scouts: u } })).toContain('1 task (0 merged, 0 dropped, 1 open) · 3k scout tokens')
})

test('stats: tasks from a scout with no name show their results under "scout" (T-622)', () => {
  const tasks = [
    task('T-1', { origin: { by: 'scout', why: '', at: '' } }),
    task('T-2', { origin: { by: 'scout', scout: '', why: '', at: '' }, status: 'dropped' }),
  ]
  const text = statsReport({ tasks, nowMs: NOW, team: { scouts: {} } })
  expect(text).toMatch(/\n {6}scout +[▇▅▂]+ +2 +100%.*\n {8}2 tasks \(1 merged, 1 dropped, 0 open\) · 0 scout tokens · 0 per merged\n/)
  expect(text).not.toContain('no tasks')
})

test('T-721: the stats list each failed try and rank a test that failed 3 tasks above one that failed 1', () => {
  const fail = (min: number, tests?: string[]) => ({ started: iso(min + 5), ended: iso(min), ended_by: 'finished' as const, ended_note: 'tests failed', failed_command: 'npm test', ...(tests ? { failed_tests: tests } : {}) })
  const ok = { started: iso(4), ended: iso(2), ended_by: 'finished' as const, ended_note: 'merged' }
  const tasks = [
    task('T-1', { runs: [fail(50, ['flaky one']), ok] }),
    task('T-2', { runs: [fail(40, ['flaky one', 'only here']), ok] }),
    task('T-3', { runs: [fail(30, ['flaky one']), { started: iso(20), ended: iso(10), ended_by: 'stopped', ended_note: 'stopped from Claude Code' }] }),
    task('T-4', { runs: [fail(20), ok] }),
  ]
  const text = statsReport({ tasks, nowMs: NOW, full: false })
  expect(text).toContain('Each failed try (5: task · try · reason · failing command · first failing test)')
  expect(text).toMatch(/T-2 +try 1 +tests failed · `npm test` · flaky one/)
  expect(text).toMatch(/T-3 +try 2 +stopped from Claude Code\n/)
  expect(text).toMatch(/T-4 +try 1 +tests failed · `npm test`\n/)
  const most = text.slice(text.indexOf('Tests that failed most'))
  expect(most).toMatch(/flaky one +3 tries · 3 tasks/)
  expect(most).toMatch(/only here +1 try · 1 task/)
  expect(most.indexOf('flaky one')).toBeLessThan(most.indexOf('only here'))
  // the short view shows the top 5 tests only
  const many = Array.from({ length: 7 }, (_, i) => task(`T-${10 + i}`, { runs: [fail(10, [`test ${i}`])] }))
  const short = statsReport({ tasks: many, nowMs: NOW })
  expect(short).toContain('top 5 of 7')
  expect(short.slice(short.indexOf('Tests that failed most'))).not.toContain('test 6')
  const full = statsReport({ tasks: many, nowMs: NOW, full: true })
  expect(full.slice(full.indexOf('Tests that failed most'))).toContain('test 6')
  // no failed try: no such parts
  expect(statsReport({ tasks: [task('T-1', { runs: [ok] })], nowMs: NOW })).not.toContain('Tests that failed most')
})

test('T-739: failedShown gives the text and html reports the same short cut: the latest tries and the top tests, all of them when full', () => {
  const tries = Array.from({ length: FAILED_TRIES_SHORT + 2 }, (_, i) => ({ id: `T-${i}`, title: '', try: 1, reason: 'r' }))
  const tests = Array.from({ length: FAILED_TESTS_SHORT + 2 }, (_, i) => ({ name: `t${i}`, tries: 1, tasks: 1 }))
  const short = failedShown({ full: false, failedTries: tries, failedTests: tests })
  expect(short.tries).toEqual(tries.slice(-FAILED_TRIES_SHORT))
  expect(short.tests).toEqual(tests.slice(0, FAILED_TESTS_SHORT))
  const all = failedShown({ full: true, failedTries: tries, failedTests: tests })
  expect(all.tries).toEqual(tries)
  expect(all.tests).toEqual(tests)
  expect(plural(1, 'try', 'tries')).toBe('1 try')
  expect(plural(2, 'task')).toBe('2 tasks')
  expect(durOr(undefined)).toBe('-')
  expect(tokOr(undefined)).toBe('-')
})

test('T-735: tries stopped on purpose (paused, dropped, backlog, turned off) are not failed tries, so the two counts agree', () => {
  const day = 24 * 60
  const stop = (min: number, note: string) => ({ started: iso(min + 5), ended: iso(min), ended_by: 'stopped' as const, ended_note: note })
  const failed = { started: iso(65), ended: iso(60), ended_by: 'finished' as const, ended_note: 'tests failed', failed_command: 'npm test', failed_tests: ['real one'] }
  const tasks = [
    task('T-1', { status: 'todo', runs: [failed], history: hist('try 1: did it → tests failed: `npm test` (exit 1)') }),
    task('T-2', { status: 'paused', runs: [stop(50, 'paused: run only T-1')], history: hist('try 1: stopped: paused: run only T-1') }),
    task('T-3', { status: 'todo', runs: [stop(45, 'the owner paused the board')], history: hist('try 1: stopped: the owner paused the board') }),
    task('T-4', { status: 'dropped', runs: [stop(40, 'dropped')] }),
    task('T-5', { status: 'backlog', runs: [stop(35, 'moved to the backlog')] }),
    task('T-6', { status: 'todo', runs: [stop(30, 'symcc was disabled')] }),
    task('T-7', { status: 'todo', runs: [stop(25, 'symcc was turned off')], history: hist('try 1: stopped: symcc was turned off') }),
  ]
  for (const t of tasks) t.created_at = iso(day / 2)
  const text = statsReport({ tasks, nowMs: NOW, range: { kind: 'days', days: 7 }, full: true })
  expect(text).toContain('Failed tries (1, from history)')
  expect(text).toContain('Each failed try (1: task · try · reason · failing command · first failing test)')
  expect(text).toMatch(/T-1 +try 1 +tests failed · `npm test` · real one/)
  for (const id of ['T-2', 'T-3', 'T-4', 'T-5', 'T-6', 'T-7']) expect(text).not.toMatch(new RegExp(`${id} +try 1`))
  expect(text).toMatch(/real one +1 try · 1 task/)
  expect(text).not.toContain('under "Failed tries"')
  // the HTML page uses the same figures
  const d = statsData({ tasks, nowMs: NOW, range: { kind: 'days', days: 7 } })
  expect([d.failedTries.length, d.failedTotal]).toEqual([1, 1])
  expect(statsHtml(d, 'p')).toContain('<h2>Each failed try (1)</h2>')
  // a try stopped for another reason still fails; when the counts differ the list says why
  const other = [...tasks, task('T-8', { status: 'failed', runs: [stop(20, 'the worker ended without a result')] })]
  const t2 = statsReport({ tasks: other, nowMs: NOW, full: true })
  expect(t2).toMatch(/T-8 +try 1 +the worker ended without a result/)
  const flat = t2.replace(/\s+/g, ' ')
  expect(flat).toContain('2 here, 1 under "Failed tries": this list reads each saved try\'s own end; that count reads the history lines, which also count tries rejected by you and restarts')
  expect(flat).not.toContain('older tries with no end saved')
})

test('T-735: with no failed try in the list but a failed history line, both reports still say why the counts differ', () => {
  const tasks = [task('T-1', { status: 'todo', history: hist('try 1: did it → tests failed: `npm test` (exit 1)') })]
  const note = '0 here, 1 under "Failed tries"'
  const text = statsReport({ tasks, nowMs: NOW }).replace(/\s+/g, ' ')
  expect(text).toContain('Failed tries (1, from history)')
  expect(text).toContain('Each failed try (0)')
  expect(text).toContain(note)
  const html = statsHtml(statsData({ tasks, nowMs: NOW }), 'p').replace(/\s+/g, ' ')
  expect(html).toContain('<h2>Each failed try (0)</h2>')
  expect(html).toContain('0 here, 1 under &quot;Failed tries&quot;')
  expect(html).not.toContain('No failed tries.')
})

test('T-736: checker send-backs, time-outs, no result, no change and not merged have their own reasons, so both failed-tries counts agree', () => {
  const run = (by: 'finished' | 'stopped' | 'timed out', note: string) => [{ started: iso(30), ended: iso(20), ended_by: by, ended_note: note }]
  const tasks = [
    task('T-1', { status: 'todo', runs: run('finished', 'checker found problems'), history: hist('try 1: checker found problems: a → b is wrong', 'try 1: did it → the checker found problems: a → b is wrong') }),
    task('T-2', { status: 'failed', runs: run('timed out', 'ran over 30 min'), history: hist('try 1: out of time; handed back: half (its work so far is kept in its folder and branch)') }),
    task('T-3', { status: 'failed', runs: run('stopped', 'the worker ended without a result'), history: hist('try 1: the worker ended without a result') }),
    task('T-4', { status: 'failed', runs: run('finished', 'no change'), history: hist('try 1: nothing to do → the worker made no change') }),
    task('T-5', { status: 'failed', runs: run('finished', 'not merged'), history: hist('try 1: x → not merged: something else') }),
    task('T-6', { status: 'todo', runs: run('stopped', 'its checking and merging ran over 15 min and was stopped'), history: hist('try 1: its checking and merging ran over 15 min and was stopped; a new try will look at it (1 of 2)') }),
    task('T-7', { status: 'failed', runs: run('stopped', "the worker's turn ended on an error"), history: hist("try 1: the worker's turn ended on an error (retries used up or the context limit); nothing was checked or merged") }),
    // an approve that could not merge is not a try of its own
    task('T-8', { status: 'review', history: hist('try 1: approved by the owner → not merged: symcc was disabled while it was being merged; it stays in review') }),
  ]
  expect(failReason('try 1: did it → the checker found problems: x')).toBe('checker')
  expect(failReason('try 1: checker found problems: x')).toBe(null)
  expect(failReason('try 2: x → tests ran out of time: `npm test` was still running after 5 min')).toBe('timeout')
  expect(failReason('try 1: x → not merged: the task was paused while it was being checked')).toBe(null)
  // the result is the last known " → ", so a "→ tests failed" in the summary doesn't make a merged try failed
  expect(failReason('try 1: changed a → tests failed handling → merged into main (abc123)')).toBe(null)
  // approves and merges once the owner's files are clear are not tries of their own, even when their tests fail
  expect(failReason('try 1: approved by the owner → not merged, the tests failed after your edits: x')).toBe(null)
  expect(failReason('try 1: merged once your files were out of the way → tests failed: x')).toBe(null)
  // checker round 2: stops on purpose during the check are not failures
  expect(failReason('try 1: did it → not merged: the task was stopped because the board was paused while it was being checked (not used: the board was paused)')).toBe(null)
  expect(failReason('try 1: did it → not merged: the task was stopped because symcc was turned off while it was being checked (x)')).toBe(null)
  expect(failReason('try 1: did it → not merged: the task was sent to the owner while it was being checked (x)')).toBe(null)
  // an arrow inside the checker's report never moves the result
  expect(failReason('try 1: did it → the checker found problems: running the suite → tests failed on b.test.ts')).toBe('checker')
  expect(failReason('try 1: did it → the checker found problems: step a → not merged when x')).toBe('checker')
  const paused = task('T-9', { status: 'todo', runs: run('stopped', 'the board was paused while its work was being checked'), history: hist('try 1: did it → not merged: the task was stopped because the board was paused while it was being checked (not used: the board was paused)') })
  const pd = statsData({ tasks: [paused], nowMs: NOW })
  expect([pd.failedTries.length, pd.failedTotal]).toEqual([0, 0])
  // checker round 3: a check that ends after its try was stopped ("not used: …") is the same try, counted once by its "stopped:" line
  expect(failReason('try 1: did it → not merged: the task was stopped because the command line stopped waiting while it was being checked (not used: the command line stopped waiting)')).toBe(null)
  const quit = task('T-10', { status: 'todo', runs: run('stopped', 'the command line stopped waiting while its work was being checked'), history: hist('try 1: stopped: the command line stopped waiting while its work was being checked; nothing merged, its files are kept', 'try 1: did it → not merged: the task was stopped because the command line stopped waiting while it was being checked (not used: the command line stopped waiting)') })
  const qd = statsData({ tasks: [quit], nowMs: NOW })
  expect([qd.failedTries.length, qd.failedTotal]).toEqual([1, 1])
  // checker round 4: a try that only left out secret-looking files waits for the owner; one whose owner's files can't be updated failed
  const secret = task('T-11', { status: 'todo', runs: [{ started: iso(30), ended: iso(20), ended_by: 'asked', ended_note: 'only secret-looking files' }], history: hist('try 1: did it → not merged: left out .env: the name looks like a secret, so it was not committed or merged (T-11/), and the task changed nothing else') })
  const sd = statsData({ tasks: [secret], nowMs: NOW })
  expect([sd.failedTries.length, sd.failedTotal]).toEqual([0, 0])
  const blocked = task('T-12', { status: 'failed', runs: run('finished', 'not merged'), history: hist("try 1: did it → your files on main can't be updated (x); fix that, then symcc retry T-12") })
  expect(failReason("try 1: did it → your files on main can't be updated (x); fix that, then symcc retry T-12")).toBe('notmerged')
  const bd = statsData({ tasks: [blocked], nowMs: NOW })
  expect([bd.failedTries.length, bd.failedTotal]).toEqual([1, 1])
  const text = statsReport({ tasks, nowMs: NOW, full: true })
  expect(text).toContain('Failed tries (7, from history)')
  expect(text).toMatch(/sent back by checker +▇+ +1/)
  expect(text).toMatch(/ran out of time +▇+ +2/)
  for (const label of ['no result', 'no change', 'not merged', 'other']) expect(text).toMatch(new RegExp(`  ${label} +▇+ +1`))
  expect(text).toContain('Each failed try (7: task')
  expect(text).not.toContain('under "Failed tries"')
  const d = statsData({ tasks, nowMs: NOW })
  expect([d.failedTries.length, d.failedTotal]).toEqual([7, 7])
  const html = statsHtml(d, 'p')
  expect(html).toContain('Failed tries by reason (7, from history)')
  expect(html).toContain('aria-label="sent back by checker: 1"')
  expect(html).toContain('aria-label="ran out of time: 2"')
  expect(html).not.toContain('under &quot;Failed tries&quot;')
})

test('T-721: a try waiting for the owner\'s files is not a failed try, and with "inside" a try keeps its own number', () => {
  const waiting = task('T-1', { status: 'todo', runs: [{ started: iso(30), ended: iso(20), ended_by: 'finished', ended_note: 'waiting for your files' }] })
  const day = 24 * 60
  const late = task('T-2', { status: 'todo', created_at: iso(4 * day), runs: [
    { started: iso(3 * day + 10), ended: iso(3 * day), ended_by: 'finished', ended_note: 'tests failed', failed_command: 'npm test', failed_tests: ['old one'] },
    { started: iso(70), ended: iso(60), ended_by: 'finished', ended_note: 'tests failed', failed_command: 'npm test', failed_tests: ['x'] },
  ] })
  const text = statsReport({ tasks: [waiting, late], nowMs: NOW, range: { kind: 'days', days: 1 }, inside: true, full: true })
  expect(text).not.toMatch(/T-1 +try 1/)
  expect(text).toContain('Each failed try (1:')
  expect(text).toMatch(/T-2 +try 2 +tests failed · `npm test` · x/)
  expect(text).not.toContain('old one')
})
