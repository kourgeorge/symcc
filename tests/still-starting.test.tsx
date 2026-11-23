// T-271: a board tool called before the plugin knows the project folder (S.root), as right after a plugin
// reload before session.start ran, must never build a path from "/" (it once tried /.symcc/board.lock).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import { path } from '../hooks/app/store'
import { S } from '../hooks/app/state'
import { ran } from './fakes'

/** Records every write and every command, wherever it points; the files hold just a board under /repo. */
function watch(on: On) {
  const writes: string[] = []
  const runs: string[][] = []
  const files = new Map<string, string>([['/repo/.symcc/board.json', JSON.stringify({ tasks: [] })]])
  on('fs.exists', (_, e) => ({ value: files.has(e.path) }))
  on('fs.read', (_, e) => (files.has(e.path) ? { value: files.get(e.path)! } : Promise.reject(new Error(`no file ${e.path}`))))
  on('fs.write', (_, e) => (writes.push(e.path), files.set(e.path, String((e as unknown as { text: string }).text)), { value: undefined }))
  on('fs.list', () => ({ value: [] }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    const argv = (e as unknown as { argv: string[] }).argv
    runs.push(argv)
    if (argv[0] === 'mv') files.set(argv[argv.length - 1]!, files.get(argv[argv.length - 2]!) ?? '')
    return { value: ran() }
  })
  return { writes, runs, files }
}

const add = async ($: { tool: { call(a: never): Promise<unknown> } }) => {
  const r = (await $.tool.call({ tool: 'mcp__symcc__add', title: 'Fix it', why: 'a test', origin_by: 'lead' } as never)) as { result?: string }
  return String(r?.result ?? '')
}

test('a board tool called before the project folder is known answers "still starting" and writes nothing', async ($, on) => {
  const w = watch(on)
  // the session can't tell its folder yet
  on('session.repo', () => ({ value: null }) as never)
  on('session.root', () => ({ value: '' }) as never)
  expect(await add($)).toBe('symcc is still starting, try again in a moment')
  expect(w.writes).toEqual([])
  expect(w.runs).toEqual([])
})

test('before session.start ran, a board tool learns the project folder from the session and writes only inside it', async ($, on) => {
  const w = watch(on)
  on('session.repo', () => ({ value: { root: '/repo' } }) as never)
  on('session.root', () => ({ value: '/repo' }) as never)
  expect(await add($)).toContain('added T-1')
  expect(w.writes.length).toBeGreaterThan(0)
  expect(w.writes.every(p => p.startsWith('/repo/'))).toBe(true)
  expect(w.runs.flat().filter(a => a.includes('.symcc')).every(a => a.startsWith('/repo/.symcc/'))).toBe(true)
})

// T-274: a slash command run before the project folder is known gets the same answer and writes nothing.
test('a slash command run before the project folder is known answers "still starting" and writes nothing', async ($, on) => {
  const w = watch(on)
  on('session.repo', () => ({ value: null }) as never)
  on('session.root', () => ({ value: '' }) as never)
  for (const [command, args] of [['symcc-disable', ''], ['symcc-scout', ''], ['symcc-stats', ''], ['symcc', '']] as const) {
    const r = (await $.command.run({ command, args } as never)) as { text?: string }
    expect(r?.text).toBe('symcc is still starting, try again in a moment')
  }
  expect(w.writes).toEqual([])
  expect(w.runs).toEqual([])
})

test('path() refuses an empty project folder, so nothing is ever built at the disk root', () => {
  const was = S.root
  try {
    S.root = ''
    expect(() => path('.symcc/board.lock')).toThrow(/project folder is not known/)
    S.root = '/repo'
    expect(path('.symcc/board.lock')).toBe('/repo/.symcc/board.lock')
  } finally {
    S.root = was
  }
})
