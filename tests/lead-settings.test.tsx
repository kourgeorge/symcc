import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { inProject } from './project'

/** A fake board.json: a save (write to a temp file, then mv over it) is kept, so the next read sees it. */
function setup(on: On, board: Record<string, unknown>) {
  const files: Record<string, string | null> = { '/board.json': JSON.stringify(board), '/board.lock': null, '/scouts.json': null }
  const fileOf = (p: string) => Object.keys(files).find(f => p.endsWith(f))
  on('fs.exists', (_, e, next) => (fileOf(e.path) ? { value: files[fileOf(e.path)!] !== null } : next(e)))
  on('fs.read', (_, e, next) => (fileOf(e.path) ? (files[fileOf(e.path)!] === null ? Promise.reject(new Error('no file')) : { value: files[fileOf(e.path)!] }) : next(e)))
  const temp: Record<string, string> = {}
  on('fs.write', (_, e) => {
    const f = fileOf(e.path)
    if (f) files[f] = String(e.text)
    else temp[e.path] = String(e.text)
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    const argv = (e as { argv?: string[] }).argv ?? []
    const [src, dest] = argv.slice(-2)
    if (argv[0] === 'mv' && src! in temp && fileOf(dest!)) files[fileOf(dest!)!] = temp[src!]!
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  // the project folder (tool calls need it, see findRoot)
  inProject(on)
  mock.clock(on, { now: Date.now() })
  return files
}

const call = async ($: { tool: { call(a: never): Promise<unknown> } }, args: Record<string, unknown>) => {
  const r = (await $.tool.call({ tool: 'mcp__symcc__settings', ...args } as never)) as { result?: string } | string
  return String(typeof r === 'string' ? r : r?.result ?? '')
}

test('settings with no params lists every setting with its value and default, incl. notify', async ($, on) => {
  setup(on, { tasks: [], max_parallel: 5, notify: 'sound', test_commands: ['npm test'] })
  const out = await call($, {})
  for (const name of ['mode', 'test_commands', 'max_parallel', 'max_minutes', 'auto_retries', 'archive_days', 'open_on_start', 'notify', 'enabled']) expect(out).toMatch(new RegExp(`^${name}: `, 'm'))
  expect(out).toContain('max_parallel: 5 (default 3')
  expect(out).toContain('test_commands: npm test (default none')
  expect(out).toMatch(/^notify: sound \(default .*this machine can play: off/m)
  expect(out).not.toContain('nothing changed')
})

test('settings still changes a setting, and the list shows the new value', async ($, on) => {
  const files = setup(on, { tasks: [] })
  expect(await call($, { max_parallel: 4 })).toContain('up to 4 at once')
  expect(JSON.parse(files['/board.json']!).max_parallel).toBe(4)
  expect(await call($, {})).toContain('max_parallel: 4 (default 3')
})
