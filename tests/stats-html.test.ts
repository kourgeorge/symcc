// T-674: /<name>-stats html writes one self-contained web page (.<name>/stats.html) from the same figures as the text
// report, escapes every board text, and tries to open it in the browser (a failure is ignored).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import type { SymccTask } from '../types'
import { fakeHost, memoryFs } from './fake-host'
import { emptyBoard, parseStatsArgs, statsData, statsReport, headlineParts, scoutRunsFile, type Board } from '../hooks/board'
import { statsHtml, headlineCards, escapeHtml, openCommands } from '../hooks/core/stats-html'
import { S } from '../hooks/app/state'
import { statsText, runTool, TOOLS } from '../hooks/app/tools'

const ROOT = '/repo/my-project'
const NOW = Date.now()
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString()

function task(id: string, title: string, over: Partial<SymccTask> = {}, tries: [number, number][] = [], ageMin = 60): SymccTask {
  const runs = tries.map(([min, tokens]) => ({ started: iso(ageMin), ended: iso(ageMin - min), agents: [{ kind: 'worker' as const, started: iso(ageMin), ended: iso(ageMin - min), tokens: { input: tokens, output: tokens / 10 } }] }))
  return { id, title, details: '', files: [], status: 'done', note: '', order: 0, after: [], attempts: tries.length, history: [], branch: null, created_at: iso(ageMin), updated_at: iso(0), ...(runs.length ? { runs } : {}), ...over }
}

const EVIL = '<script>alert("x")</script> & \'q\''
const TASKS = (): SymccTask[] => [
  task('T-1', EVIL, {}, [[10, 1000]]),
  task('T-2', 'Plain <b> one', {}, [[20, 4000], [5, 500]]),
  task('T-3', 'Still going <b>', { status: 'doing' }, [[15, 2000]]),
  task('T-40', 'Old one', { updated_at: iso(60 * 24 * 30) }, [[30, 3000]], 60 * 24 * 31),
]

/** A fake host with the board in memory; `run` records each command and answers `exitCode` (or throws). */
function world(runAnswer: 'ok' | 'fail' | 'throw' = 'ok') {
  const files = new Map<string, string>()
  const ran: string[][] = []
  const f = fakeHost({
    session: { repo: async () => ({ root: ROOT }), root: async () => ROOT },
    fs: memoryFs(files),
    lead: { usage: async () => ({ leadProblem: 'not here' }) },
    run: async argv => {
      ran.push([...argv])
      if (argv[0] === 'uname') return { exitCode: 0, stdout: 'Darwin\n', stderr: '' }
      if (runAnswer === 'throw') throw new Error('this host runs no commands')
      return { exitCode: runAnswer === 'ok' ? 0 : 1, stdout: '', stderr: '' }
    },
  })
  S.root = ROOT
  const b: Board = { ...emptyBoard(), tasks: TASKS() } as Board
  files.set(`${ROOT}/${S.N.boardFile}`, JSON.stringify(b, null, 2) + '\n')
  return { ...f, files, ran }
}

const page = (w: ReturnType<typeof world>) => w.files.get(`${ROOT}/${S.N.dir}/stats.html`) ?? ''

test('stats html: "html" is read apart from "full" and the range', () => {
  expect(parseStatsArgs('html')).toEqual({ full: false, html: true, inside: false, range: '' })
  expect(parseStatsArgs('HTML 7d')).toEqual({ full: false, html: true, inside: false, range: '7d' })
  expect(parseStatsArgs('html T-1..T-9 full')).toEqual({ full: true, html: true, inside: false, range: 'T-1..T-9' })
})

test('stats html: writes .<name>/stats.html for all tasks, 7d and an id range, says where, and opens it', async () => {
  for (const [args, count] of [['html', 4], ['html 7d', 3], ['html T-1..T-3', 3]] as const) {
    const w = world()
    const said = await statsText(w.host, args)
    const file = `${ROOT}/${S.N.dir}/stats.html`
    expect(said).toContain(file)
    expect(said).toContain('opened in your browser')
    const html = page(w)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('my-project')
    expect(html).toContain(`${count} tasks`)
    expect(w.ran.some(a => a[0] === 'open' && a[1] === file)).toBe(true)
  }
  // the 7d page leaves the old task out, the id range everything past T-3
  const w = world()
  await statsText(w.host, 'html 7d')
  expect(page(w)).not.toContain('Old one')
})

test("stats html: the shared stats tool stays read-only (no html, even slipped into the range)", async () => {
  const w = world()
  const said = await runTool(w.host, 'stats', { html: true, range: '7d' })
  expect(said).not.toContain('stats.html')
  await runTool(w.host, 'stats', { range: 'html 7d' })
  expect(page(w)).toBe('')
  const def = TOOLS().find(t => t.name === 'stats')
  expect(JSON.stringify(def?.inputSchema ?? {})).not.toContain('html')
})

test('stats html: a failed or impossible open step is ignored, and the path is still given', async () => {
  for (const how of ['fail', 'throw'] as const) {
    const w = world(how)
    const said = await statsText(w.host, 'html')
    expect(said).toContain(`${ROOT}/${S.N.dir}/stats.html`)
    expect(said).toContain('open it in your browser')
    expect(page(w).length > 1000).toBe(true)
  }
  // with no platform known, every opener is tried in turn
  expect(openCommands('/x.html', undefined).map(a => a[0])).toEqual(['open', 'xdg-open', 'cmd'])
  expect(openCommands('/x.html', 'linux')).toEqual([['xdg-open', '/x.html']])
})

test('stats html: no external URLs, no script, and every board text escaped', async () => {
  const w = world()
  await statsText(w.host, 'html')
  const html = page(w)
  expect(html).not.toMatch(/https?:\/\//)
  expect(html).not.toMatch(/\b(src|href)=/)
  expect(html).not.toMatch(/<script/i)
  expect(html).not.toContain('<b>')
  expect(html).toContain(escapeHtml(EVIL))
  expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;')
  expect(html).toContain('Plain &lt;b&gt; one')
})

test("stats html: the headline numbers are the text report's", () => {
  const input = { tasks: TASKS(), nowMs: NOW, name: S.N.name }
  const d = statsData(input)
  const text = statsReport(input)
  const html = statsHtml(d, 'p')
  const cards = headlineCards(d)
  const line = headlineParts(d).join(' · ')
  expect(text).toContain(line)
  expect(line).toContain(`${cards[0]!.value} done`)
  expect(line).toContain(`${cards[2]!.value} of work`)
  expect(line).toContain(`${cards[3]!.value} tokens`)
  expect(line).toContain(`${cards[4]!.value} right first try`)
  for (const c of cards) expect(html).toContain(`<div class="cv">${escapeHtml(c.value)}</div>`)
  expect(cards[0]!.value).toBe('3')
})

test('stats (T-719): the stats tool and /stats take "inside", and a scout task its runs file does not list is counted', async () => {
  const w = world()
  const said = await runTool(w.host, 'stats', { range: '7d', inside: true })
  expect(said).toContain('Counting: only the work inside the last 7 days')
  expect(await runTool(w.host, 'stats', { range: '7d' })).toContain('Counting: whole tries of tasks changed in the last 7 days')
  expect(await statsText(w.host, '7d inside')).toContain('Counting: only the work inside the last 7 days')
  const def = TOOLS().find(t => t.name === 'stats')
  expect(JSON.stringify(def?.inputSchema ?? {})).toContain('inside')
  // two tasks of scout bugs, its runs file lists only T-50
  const mine = (id: string) => task(id, `scout task ${id}`, { status: 'todo', origin: { by: 'scout', scout: 'bugs', why: 'w', at: iso(5) } }, [], 5)
  const b: Board = { ...emptyBoard(), tasks: [...TASKS(), mine('T-50'), mine('T-51')] } as Board
  w.files.set(`${ROOT}/${S.N.boardFile}`, JSON.stringify(b, null, 2) + '\n')
  w.files.set(`${ROOT}/${scoutRunsFile('bugs', S.N.name)}`, JSON.stringify({ runs: [{ started: iso(20), ended: iso(10), outcome: 'found', findings: 2, tasks: ['T-50'] }] }))
  expect(await statsText(w.host, '')).toContain('        1 task not linked to a run')
})

test('stats html (T-731): "Each failed try" and "Tests that failed most" from the same figures, and empty notes when none', () => {
  const fail = (min: number, tests?: string[]) => ({ started: iso(min + 5), ended: iso(min), ended_by: 'finished' as const, ended_note: 'tests failed', failed_command: 'npm test <x>', ...(tests ? { failed_tests: tests } : {}) })
  const ok = { started: iso(4), ended: iso(2), ended_by: 'finished' as const, ended_note: 'merged' }
  const tasks = [
    task('T-1', 'One', { runs: [fail(50, ['flaky <one>']), ok] }),
    task('T-2', 'Two', { runs: [fail(40, ['flaky <one>', 'only here']), ok] }),
    task('T-3', 'Three', { runs: [fail(30, ['flaky <one>']), ok] }),
  ]
  const d = statsData({ tasks, nowMs: NOW, name: S.N.name })
  const html = statsHtml(d, 'p')
  expect(html).toContain('<h2>Each failed try (3)</h2>')
  expect(html).toContain('<tr><td>T-2 Two</td><td>1</td><td><code>npm test &lt;x&gt;</code></td><td>tests failed</td><td>flaky &lt;one&gt;</td></tr>')
  expect(html).toContain('<h2>Tests that failed most</h2>')
  const most = html.slice(html.indexOf('Tests that failed most'))
  expect(most).toContain('<div class="num">3 tasks · 3 tries</div>')
  expect(most).toContain('<div class="num">1 task · 1 try</div>')
  expect(most.indexOf('flaky &lt;one&gt;')).toBeLessThan(most.indexOf('only here'))
  const none = statsHtml(statsData({ tasks: [task('T-1', 'One', { runs: [ok] })], nowMs: NOW, name: S.N.name }), 'p')
  expect(none).toContain('No failed tries.')
  expect(none).toContain('No failing tests recorded.')
  expect(none).not.toContain('<td>tests failed</td>')
})
