import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { fileToolHits } from '../hooks/plugin/scouts'

/**
 * Fake files for the scouts and roles folders: `files` maps the end of a path to its text (null = no file).
 * Every published view and every folder listed is kept, so a test can see what the plugin did.
 */
function fakeFiles(on: On, files: Record<string, string | null>) {
  const views: string[] = []
  const listed: string[] = []
  const fileOf = (p: string) => Object.keys(files).find(f => p.endsWith(f))
  const namesIn = (dir: string) => Object.keys(files).filter(f => f.startsWith(`${dir}/`) && files[f] !== null).map(f => ({ name: f.slice(dir.length + 1), kind: 'file' }))
  on('fs.exists', (_, e, next) => (fileOf(e.path) ? { value: files[fileOf(e.path)!] !== null } : /\/(scouts|roles)$/.test(e.path) ? { value: true } : next(e)))
  on('fs.list', (_, e, next) => {
    listed.push(e.path)
    if (e.path.endsWith('/.symcc/scouts')) return { value: namesIn('/.symcc/scouts') }
    if (e.path.endsWith('/roles')) return { value: namesIn('/.symcc/roles') }
    return next(e)
  })
  on('fs.read', (_, e, next) => (fileOf(e.path) ? (files[fileOf(e.path)!] === null ? Promise.reject(new Error('no file')) : { value: files[fileOf(e.path)!] }) : next(e)))
  on('fs.write', () => ({ value: undefined }))
  on('state.set', (_, e, next) => {
    if (e.key === 'view') views.push(JSON.stringify((e as { value?: unknown }).value))
    return next(e)
  })
  on('ui.status', () => ({ value: undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }))
  mock.clock(on, { now: Date.now() })
  return { views, listed }
}

/** The engine's own Write, Edit and Bash, beneath the plugin: the file change happens here. */
function fakeTools(on: On, files: Record<string, string | null>) {
  on('tool.call', (_, e) => {
    const a = e as unknown as { tool: string; file_path?: string; content?: string; command?: string }
    if (a.tool === 'Write') files[a.file_path!.slice(a.file_path!.indexOf('/.symcc/'))] = a.content ?? ''
    if (a.tool === 'Bash' && /^rm /.test(a.command ?? '')) files[`/${a.command!.slice(3)}`] = null
    return { result: 'ok' }
  })
}

const settle = async (until: () => boolean) => {
  for (let i = 0; i < 100 && !until(); i++) await new Promise(r => setTimeout(r, 5))
}
const lastView = (views: string[]) => views[views.length - 1] ?? ''

test('fileToolHits: Write, Edit and MultiEdit of a scout or role file count; Bash only when it changes files', () => {
  const S = '.symcc/scouts', R = '.symcc/roles'
  expect(fileToolHits({ tool: 'Write', file_path: '/p/.symcc/scouts/x.md' }, S, R)).toEqual({ scouts: true, roles: false })
  expect(fileToolHits({ tool: 'Edit', file_path: '/p/.symcc/scouts/x.md' }, S, R)).toEqual({ scouts: true, roles: false })
  expect(fileToolHits({ tool: 'MultiEdit', file_path: '/p/.symcc/roles/docs.md' }, S, R)).toEqual({ scouts: false, roles: true })
  expect(fileToolHits({ tool: 'Write', file_path: '/p/src/a.ts' }, S, R)).toEqual({ scouts: false, roles: false })
  expect(fileToolHits({ tool: 'Bash', command: 'rm .symcc/scouts/x.md' }, S, R)).toEqual({ scouts: true, roles: false })
  expect(fileToolHits({ tool: 'Bash', command: 'cat .symcc/scouts/x.md' }, S, R)).toEqual({ scouts: false, roles: false })
  expect(fileToolHits({ tool: 'Read', file_path: '/p/.symcc/scouts/x.md' }, S, R)).toEqual({ scouts: false, roles: false })
})

test('a Write of a new scout file reschedules the scouts and the published view lists it; an Edit does too; rm takes it off', async ($, on) => {
  const files: Record<string, string | null> = { '/.symcc/scouts/bugs.md': '---\nevery_minutes: 30\n---\nLook for crashes.\n', '/scouts.json': null, '/board.json': JSON.stringify({ tasks: [] }), '/board.lock': null }
  const { views } = fakeFiles(on, files)
  fakeTools(on, files)
  await $.tool.call({ tool: 'Write', file_path: '/proj/.symcc/scouts/x.md', content: '---\nevery_minutes: 20\n---\nCheck the docs.\n' } as never)
  await settle(() => lastView(views).includes('"x"'))
  expect(lastView(views)).toContain('"name":"x"')
  expect(lastView(views)).toContain('"name":"bugs"')
  // its timer runs: the view gives it a next run
  expect(lastView(views)).toMatch(/"name":"x","every_minutes":20[^}]*"next_run"/)

  // an Edit (the engine changes the file) shows the new timing
  const before = views.length
  files['/.symcc/scouts/x.md'] = '---\nevery_minutes: 45\n---\nCheck the docs.\n'
  await $.tool.call({ tool: 'Edit', file_path: '/proj/.symcc/scouts/x.md', old_string: '20', new_string: '45' } as never)
  await settle(() => views.length > before && lastView(views).includes('"every_minutes":45'))
  expect(lastView(views)).toContain('"name":"x","every_minutes":45')

  // deleting it with Bash takes it off the board
  await $.tool.call({ tool: 'Bash', command: 'rm .symcc/scouts/x.md' } as never)
  await settle(() => !lastView(views).includes('"name":"x"'))
  expect(lastView(views)).not.toContain('"name":"x"')
  expect(lastView(views)).toContain('"name":"bugs"')
})

test('a Write of a role file reloads the roles', async ($, on) => {
  const files: Record<string, string | null> = { '/.symcc/roles/docs.md': '---\ndescription: writes the docs\n---\n', '/scouts.json': null, '/board.json': JSON.stringify({ tasks: [] }), '/board.lock': null }
  const { listed, views } = fakeFiles(on, files)
  fakeTools(on, files)
  // (in the test kit the project folder is not set, so the roles are read from the plugin's roles/ folder)
  const rolesListed = () => listed.filter(p => p.endsWith('/roles')).length
  const before = rolesListed()
  await $.tool.call({ tool: 'Write', file_path: '/proj/.symcc/roles/tester.md', content: '---\ndescription: writes tests\n---\n' } as never)
  await settle(() => rolesListed() > before && views.length > 0)
  expect(rolesListed()).toBeGreaterThan(before)
  expect(views.length).toBeGreaterThan(0)
})
