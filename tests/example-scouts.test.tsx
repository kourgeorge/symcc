// A new project (no scouts folder yet) starts with the plugin's example scouts, all paused (T-221).
// Files, git and agents are a fake world; time is the fake clock.
import { expect, mock } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import { SCOUT_SOON_MS, SCOUT_SPREAD_MS } from '../hooks/plugin/scouts'

const T0 = 1_800_000_000_000
const EXAMPLES = ['bugs', 'deps', 'docs-check', 'gaps', 'recent-changes', 'secrets', 'simplify', 'test-gaps']
const EVERY_MINUTES = 5
const example = (n: string) => `---\nevery_minutes: ${EVERY_MINUTES}\n---\nExample ${n}.\n`
type Res = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Res => ({ exitCode: 0, stdout, stderr: '' })

/**
 * Project files in memory (keyed from "/.symcc/" on), the plugin's examples under ".../examples/scouts/", and
 * folders made with mkdir -p. `failWrite` makes writes of a path with that text in it fail; `failExamples`
 * makes the examples folder unreadable.
 */
function world(on: On, o: { files?: Record<string, string>; dirs?: string[]; failWrite?: string; failExamples?: boolean } = {}) {
  const files = new Map<string, string>(Object.entries(o.files ?? {}))
  const dirs = new Set<string>(o.dirs ?? [])
  const toasts: string[] = []
  const spawned: string[] = []
  const key = (p: string) => (p.includes('/.symcc/') ? p.slice(p.indexOf('/.symcc/')) : p)
  const ex = (p: string) => p.match(/\/examples\/scouts(?:\/(.+))?$/)
  on('fs.exists', (_, e) => ({ value: files.has(key(e.path)) || dirs.has(key(e.path)) }))
  on('fs.read', (_, e) => {
    const m = ex(e.path)
    if (m?.[1]) return o.failExamples ? Promise.reject(new Error('no access')) : { value: example(m[1].replace(/\.md$/, '')) }
    return files.has(key(e.path)) ? { value: files.get(key(e.path))! } : Promise.reject(new Error(`no file ${e.path}`))
  })
  on('fs.write', (_, e) => {
    if (o.failWrite && e.path.includes(o.failWrite)) return Promise.reject(new Error('disk full')) as never
    files.set(key(e.path), (e as unknown as { text: string }).text)
    return { value: undefined }
  })
  on('fs.stat', (_, e) => (files.has(key(e.path)) ? { value: { mtimeMs: T0 } } : Promise.reject(new Error('no file'))) as never)
  on('fs.list', (_, e) => {
    if (ex(e.path)) return o.failExamples ? (Promise.reject(new Error('no access')) as never) : { value: [...EXAMPLES.map(n => ({ name: `${n}.md`, kind: 'file' })), { name: 'notes.txt', kind: 'file' }] }
    const dir = `${key(e.path)}/`
    return { value: [...files.keys()].filter(f => f.startsWith(dir) && !f.slice(dir.length).includes('/')).map(f => ({ name: f.slice(dir.length), kind: 'file' })) }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_, e) => (toasts.push(String((e as unknown as { text?: string; message?: string }).text ?? (e as unknown as { message?: string }).message ?? JSON.stringify(e))), { value: undefined }) as never)
  on('agent.spawn', (_, e) => (spawned.push(String((e as unknown as { name?: string }).name)), { model: 'sonnet' }) as never)
  on('process.run', (_, e) => {
    const [cmd, ...rest] = (e as unknown as { argv: string[] }).argv
    if (cmd === 'git') return { value: rest[0] === 'rev-parse' && rest[1] === '--is-inside-work-tree' ? ok('true\n') : ok() }
    if (cmd === 'mkdir') for (const p of rest.filter(x => !x.startsWith('-'))) dirs.add(key(p))
    if (cmd === 'ln') {
      if (files.has(key(rest[1]!))) return { value: { exitCode: 1, stdout: '', stderr: 'File exists' } }
      files.set(key(rest[1]!), files.get(key(rest[0]!)) ?? '')
    }
    if (cmd === 'mv') {
      const [, from, to] = rest
      files.set(key(to!), files.get(key(from!)) ?? '')
      files.delete(key(from!))
    }
    if (cmd === 'rm') for (const p of rest.filter(x => !x.startsWith('-'))) files.delete(key(p))
    return { value: ok() }
  })
  on('tool.call', () => ({ result: 'ran' }))
  on('agent.list', () => ({ value: [] }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  on('session.repo', () => ({ value: { root: '/repo' } }) as never)
  on('session.root', () => ({ value: '/repo' }) as never)
  on('session.id', () => ({ value: 'me' }) as never)
  on('env.get', () => ({ value: undefined }) as never)
  const clock = mock.clock(on, { now: T0 })
  return { files, dirs, toasts, spawned, clock }
}

const start = async ($: Parameters<Parameters<typeof test>[1]>[0]) => {
  await ($.session.start({ cwd: '/repo' } as never) as Promise<unknown>)
}
const paused = (files: Map<string, string>) => {
  const m = JSON.parse(files.get('/.symcc/scouts.json') ?? '{"scouts":{}}') as { scouts: Record<string, { paused?: boolean }> }
  return Object.keys(m.scouts).filter(n => m.scouts[n]!.paused === true).sort()
}
const scoutFiles = (files: Map<string, string>) => [...files.keys()].filter(f => f.startsWith('/.symcc/scouts/')).sort()
// open_on_start off: drawing the board panel at every start is what made these tests slow (over 5 s), and
// none of them is about the panel.
const board = (extra: Record<string, unknown> = {}) => JSON.stringify({ tasks: [], open_on_start: false, ...extra })
const scoutSpawns = (spawned: string[]) => spawned.filter(n => /scout/i.test(n))
// scouts.ts checks a paused scout again this long after its timer fires (PAUSED_RECHECK_MS, not exported)
const PAUSED_RECHECK_MS = 60_000
// Past every scout's first timer (spread apart) and one paused recheck after it; a paused scout keeps its time,
// so later ticks only repeat that recheck. Kept short on purpose: every 30 s of fake time also fires the lead
// heartbeat (and more), and jumping an hour or so made these tests run over 5 s on a busy machine.
const PAST_EVERY_TIMER = SCOUT_SOON_MS + SCOUT_SPREAD_MS * EXAMPLES.length + PAUSED_RECHECK_MS

test('a project with no scouts folder gets all the example scouts, all paused, and is told once', async ($, on) => {
  const w = world(on, { files: { '/.symcc/board.json': board({ mode: 'auto' }) } })
  await start($)
  expect(scoutFiles(w.files)).toEqual(EXAMPLES.map(n => `/.symcc/scouts/${n}.md`))
  expect(w.files.get('/.symcc/scouts/bugs.md')).toBe(example('bugs'))
  expect(paused(w.files)).toEqual(EXAMPLES)
  expect(w.toasts.filter(t => t.includes('example scouts')).length).toBe(1)
})

test('the example scouts do not run on their timer, even well past every timer', async ($, on) => {
  const w = world(on, { files: { '/.symcc/board.json': board({ mode: 'auto' }) } })
  await start($)
  expect(paused(w.files)).toEqual(EXAMPLES)
  await w.clock.advance(PAST_EVERY_TIMER)
  expect(scoutSpawns(w.spawned)).toEqual([])
})

test('run now on an example scout runs it once, and it stays paused (a pause only stops the timer)', async ($, on) => {
  const w = world(on, { files: { '/.symcc/board.json': board({ mode: 'auto' }) } })
  await start($)
  await w.clock.advance(PAST_EVERY_TIMER)
  expect(scoutSpawns(w.spawned)).toEqual([])
  const r = (await $.tool.call({ tool: 'mcp__symcc__scouts', action: 'run', name: 'bugs' } as never)) as { result?: string } | string
  // the scout is spawned (the test kit hands back no agent id, so the plugin calls it a failed start; what
  // matters here is that run now is not refused for the pause and the scout's agent is asked to start)
  expect(typeof r === 'string' ? r : String(r.result)).not.toContain('paused')
  expect(scoutSpawns(w.spawned).length).toBe(1)
  expect(scoutSpawns(w.spawned)[0]).toContain('bugs')
  expect(paused(w.files)).toEqual(EXAMPLES)
  // the other examples still don't run on their timer
  await w.clock.advance(PAST_EVERY_TIMER)
  expect(scoutSpawns(w.spawned).length).toBe(1)
  expect(paused(w.files)).toEqual(EXAMPLES)
})

test('a second start (the scouts folder is there now) adds no examples and says nothing', async ($, on) => {
  const w = world(on, { files: { '/.symcc/board.json': board({ mode: 'auto' }) } })
  await start($)
  w.files.delete('/.symcc/scouts/deps.md')
  await start($)
  expect(scoutFiles(w.files)).not.toContain('/.symcc/scouts/deps.md')
  expect(w.toasts.filter(t => t.includes('example scouts')).length).toBe(1)
})

test('a project with an empty scouts folder gets nothing new', async ($, on) => {
  const w = world(on, { files: { '/.symcc/board.json': board() }, dirs: ['/.symcc/scouts'] })
  await start($)
  expect(scoutFiles(w.files)).toEqual([])
  expect(paused(w.files)).toEqual([])
  expect(w.toasts.filter(t => t.includes('example scouts'))).toEqual([])
})

test('a project with its own scouts gets nothing new and its scout file is left as it is', async ($, on) => {
  const mine = '---\nevery_minutes: 60\n---\nMy own bugs scout.\n'
  const w = world(on, { files: { '/.symcc/board.json': board(), '/.symcc/scouts/bugs.md': mine }, dirs: ['/.symcc/scouts'] })
  await start($)
  expect(scoutFiles(w.files)).toEqual(['/.symcc/scouts/bugs.md'])
  expect(w.files.get('/.symcc/scouts/bugs.md')).toBe(mine)
  expect(paused(w.files)).toEqual([])
})

test('control: a scout that is not paused does run on its timer in this fake world', async ($, on) => {
  const mine = `---\nevery_minutes: ${EVERY_MINUTES}\n---\nMy own bugs scout.\n`
  const w = world(on, { files: { '/.symcc/board.json': board({ mode: 'auto' }), '/.symcc/scouts/bugs.md': mine }, dirs: ['/.symcc/scouts'] })
  await start($)
  await w.clock.advance(PAST_EVERY_TIMER)
  expect(scoutSpawns(w.spawned).length).toBeGreaterThan(0)
})

test('examples that cannot be read: symcc still starts, and the owner is told once', async ($, on) => {
  const w = world(on, { files: { '/.symcc/board.json': board() }, failExamples: true })
  await start($)
  expect(scoutFiles(w.files)).toEqual([])
  expect(w.toasts.filter(t => t.includes("couldn't add the example scouts")).length).toBe(1)
  // the start went on: the regular check and heartbeat are set, and the board is still there
  expect(w.files.has('/.symcc/board.json')).toBe(true)
  const r = (await $.tool.call({ tool: 'mcp__symcc__scouts' } as never)) as { result?: string } | string
  expect(typeof r === 'string' ? r : String(r.result)).toContain('no scouts yet')
})

test('a copy that fails: symcc still starts, the owner is told once, and what was copied stays paused', async ($, on) => {
  const w = world(on, { files: { '/.symcc/board.json': board() }, failWrite: 'scouts/deps.md' })
  await start($)
  expect(scoutFiles(w.files)).toEqual(['/.symcc/scouts/bugs.md'])
  expect(paused(w.files)).toEqual(EXAMPLES)
  expect(w.toasts.filter(t => t.includes("couldn't add the example scouts")).length).toBe(1)
  await w.clock.advance(PAST_EVERY_TIMER)
  expect(scoutSpawns(w.spawned)).toEqual([])
})
