import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { parseScout, safeScoutFile, resolveRel } from '../hooks/board'
import { runScoutNow, setScoutPaused } from '../hooks/plugin/scouts'

/**
 * Fake scouts folder, scouts.json and board: `files` maps the end of a path to its text (null = no file).
 * fs.write and `rm -f` change `files`, so what the lead's scouts tool writes or deletes is seen by the next read.
 */
function setup(on: On, files: Record<string, string | null>) {
  const views: string[] = []
  /** every path written or deleted, wherever it is */
  const touched: string[] = []
  const key = (p: string) => p.slice(p.indexOf('/.symcc/') >= 0 && p.includes('/scouts/') ? p.indexOf('/.symcc/') : p.lastIndexOf('/'))
  const fileOf = (p: string) => Object.keys(files).find(f => p.endsWith(f))
  on('fs.exists', (_, e, next) => (fileOf(e.path) ? { value: files[fileOf(e.path)!] !== null } : /\/scouts$/.test(e.path) ? { value: true } : next(e)))
  on('fs.list', (_, e, next) =>
    e.path.endsWith('/.symcc/scouts') ? { value: Object.keys(files).filter(f => f.startsWith('/.symcc/scouts/') && files[f] !== null).map(f => ({ name: f.slice('/.symcc/scouts/'.length), kind: 'file' })) } : next(e),
  )
  on('fs.read', (_, e, next) => (fileOf(e.path) ? (files[fileOf(e.path)!] === null ? Promise.reject(new Error('no file')) : { value: files[fileOf(e.path)!] }) : next(e)))
  on('fs.write', (_, e) => {
    if (!e.path.endsWith('.tmp') && !/\/(scouts\.json|board\.json|board\.lock)$/.test(e.path)) touched.push(e.path)
    if (e.path.includes('/.symcc/scouts/')) files[key(e.path)] = String(e.text)
    return { value: undefined }
  })
  on('state.set', (_, e, next) => {
    if (e.key === 'view') views.push(JSON.stringify((e as { value?: unknown }).value))
    return next(e)
  })
  on('ui.status', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    const argv = (e as { argv?: string[] }).argv ?? []
    if (argv[0] === 'rm') {
      const p = argv[argv.length - 1]!
      touched.push(p)
      if (p.includes('/.symcc/scouts/')) files[key(p)] = null
    }
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  mock.clock(on, { now: Date.now() })
  return { views, touched }
}

const call = async ($: { tool: { call(a: never): Promise<unknown> } }, args: Record<string, unknown>) => {
  const r = (await $.tool.call({ tool: 'mcp__symcc__scouts', ...args } as never)) as { result?: string } | string
  return String(typeof r === 'string' ? r : r?.result ?? '')
}
const base = () => ({ '/.symcc/scouts/bugs.md': '---\nevery_minutes: 30\n---\nLook for crashes.\n', '/scouts.json': null, '/board.json': JSON.stringify({ tasks: [] }), '/board.lock': null }) as Record<string, string | null>
const lastView = (views: string[]) => views[views.length - 1] ?? ''

test('scouts add writes a valid scout file, the board shows it, and list shows it in plain words', async ($, on) => {
  const files = base()
  const { views } = setup(on, files)
  const out = await call($, { action: 'add', name: 'docs-check', every_minutes: 2880, model: 'sonnet', prompt: 'Check the docs match the code.' })
  expect(out).toContain('added scout docs-check')
  const def = parseScout('docs-check', files['/.symcc/scouts/docs-check.md'] ?? '')
  expect(def).toMatchObject({ every_minutes: 2880, model: 'sonnet', prompt: 'Check the docs match the code.' })
  expect(lastView(views)).toContain('"name":"docs-check"')
  const list = await call($, {})
  expect(list).toContain('docs-check: every 2 days')
  expect(list).toContain('bugs: every 30 min')
  expect(list).toContain('not paused')
  expect(list).toContain('last run: never')
  const one = await call($, { action: 'list', name: 'docs-check' })
  expect(one).toContain('prompt:\nCheck the docs match the code.')
  // a taken name is refused
  expect(await call($, { action: 'add', name: 'bugs', every_minutes: 5, prompt: 'x' })).toContain('already exists')
})

test('scouts add refuses a bad name and writes nothing', async ($, on) => {
  const files = base()
  setup(on, files)
  for (const bad of ['Docs', 'docs_check', '../x', 'a b', ''])
    expect(await call($, { action: 'add', name: bad, every_minutes: 0, prompt: 'Look.' })).toMatch(/not a valid scout name|give the scout a name/)
  expect(Object.keys(files).filter(f => f.startsWith('/.symcc/scouts/'))).toEqual(['/.symcc/scouts/bugs.md'])
})

test('scouts edit changes what it is given and keeps the rest; on demand reads "on demand"', async ($, on) => {
  const files = base()
  setup(on, files)
  expect(await call($, { action: 'edit', name: 'bugs', every_minutes: 0 })).toContain('saved scout bugs')
  expect(parseScout('bugs', files['/.symcc/scouts/bugs.md']!)).toMatchObject({ every_minutes: 0, prompt: 'Look for crashes.' })
  expect(await call($, {})).toContain('bugs: on demand')
  await call($, { action: 'edit', name: 'bugs', prompt: 'Look for hangs.' })
  expect(parseScout('bugs', files['/.symcc/scouts/bugs.md']!)).toMatchObject({ every_minutes: 0, prompt: 'Look for hangs.' })
  expect(await call($, { action: 'edit', name: 'nope', prompt: 'x' })).toContain('no scout named nope')
  expect(await call($, { action: 'edit', name: 'bugs', every_minutes: -5 })).toContain('whole number')
})

test('scouts remove deletes the file and takes it off the board', async ($, on) => {
  const files = base()
  const { views } = setup(on, files)
  expect(await call($, {})).toContain('bugs: every 30 min')
  expect(await call($, { action: 'remove', name: 'bugs' })).toContain('removed scout bugs')
  expect(files['/.symcc/scouts/bugs.md']).toBeNull()
  expect(lastView(views)).not.toContain('"name":"bugs"')
  expect(await call($, {})).toContain('no scouts yet')
})

test('scouts run is refused for a paused scout; pause and resume are for the owner only', async ($, on) => {
  const files = { ...base(), '/scouts.json': JSON.stringify({ scouts: { bugs: { last_run: null, paused: true } } }) }
  setup(on, files)
  expect(await call($, { action: 'run', name: 'bugs' })).toContain('bugs is paused')
  expect(await call($, {})).toContain('bugs: every 30 min · paused')
  expect(await call($, { action: 'pause', name: 'bugs' })).toBe('only the owner pauses or resumes scouts')
  expect(await call($, { action: 'resume', name: 'bugs' })).toBe('only the owner pauses or resumes scouts')
})

test('scouts edit, remove, run and list refuse a name that could reach outside the scouts folder', async ($, on) => {
  const readme = '# the project\n'
  const files = { ...base(), '/README.md': readme, '/x.md': 'outside\n' }
  const { touched } = setup(on, files)
  for (const bad of ['../x', '../../README', 'a/b', '..', '../../.symcc/scouts/bugs', '/etc/passwd', 'a\\b', '.'])
    for (const action of ['edit', 'remove', 'run', 'list']) {
      const out = await call($, { action, name: bad, every_minutes: 5, prompt: 'Overwrite.' })
      expect(out).toContain('not a valid scout name')
    }
  expect(files['/README.md']).toBe(readme)
  expect(files['/x.md']).toBe('outside\n')
  expect(files['/.symcc/scouts/bugs.md']).toContain('Look for crashes.')
  expect(touched).toEqual([])
  // valid names still work
  expect(await call($, { action: 'list', name: 'bugs' })).toContain('Look for crashes.')
  expect(await call($, { action: 'edit', name: 'bugs', prompt: 'Look for hangs.' })).toContain('saved scout bugs')
  expect(await call($, { action: 'remove', name: 'bugs' })).toContain('removed scout bugs')
  expect(touched.every(p => p.includes('/.symcc/scouts/bugs.md'))).toBe(true)
  expect(touched.length).toBe(2)
  expect(files['/README.md']).toBe(readme)
})

test('the scout file path is refused unless it is directly inside the scouts folder', () => {
  expect(safeScoutFile('bugs')).toBe('.symcc/scouts/bugs.md')
  expect(safeScoutFile('My_Scout-2')).toBe('.symcc/scouts/My_Scout-2.md')
  for (const bad of ['../x', '../../README', 'a/b', '..', '.', '', 'a\\b', '/etc/passwd', 'a b', 'x'.repeat(65)]) expect(safeScoutFile(bad)).toBeNull()
  expect(resolveRel('.symcc/scouts/../../README.md')).toBe('README.md')
  expect(resolveRel('a\\..\\..\\b')).toBe('../b')
})

test("the owner's /symcc-scout refuses a name that is not a scout name", async ($, on) => {
  setup(on, base())
  expect(await runScoutNow($ as never, '../../README')).toContain('is not a scout name')
  expect(await setScoutPaused($ as never, 'a/b', true)).toContain('is not a scout name')
})
