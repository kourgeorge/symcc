// T-502: in mode review the lead asks the owner before every add; the add answer reminds it, in review mode only.
import { expect, mock } from 'claude-code/testing'
import { test } from './reset'
import type { On } from 'claude-code'
import { inProject } from './project'
import { ran, readText } from './fakes'
import { leadGuide, REVIEW_ADD_REMINDER } from '../hooks/app/tools'
import { S } from '../hooks/app/state'

/** A fake board.json: a save (write to a temp file, then mv over it) is kept, so the next read sees it. */
function setup(on: On, board: Record<string, unknown>) {
  const files: Record<string, string | null> = { '/board.json': JSON.stringify(board), '/board.lock': null, '/scouts.json': null }
  const fileOf = (p: string) => Object.keys(files).find(f => p.endsWith(f))
  on('fs.exists', (_, e, next) => (fileOf(e.path) ? { value: files[fileOf(e.path)!] !== null } : next(e)))
  on('fs.read', (_, e, next) => (fileOf(e.path) ? readText(files[fileOf(e.path)!]) : next(e)))
  const temp: Record<string, string> = {}
  on('fs.write', (_, e) => {
    const f = fileOf(e.path)
    if (f) files[f] = String(e.text)
    else temp[e.path] = String(e.text)
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    const argv = (e as { argv?: string[] }).argv ?? []
    const [src, dest] = argv.slice(-2)
    if (argv[0] === 'mv' && src! in temp && fileOf(dest!)) files[fileOf(dest!)!] = temp[src!]!
    return { value: ran() }
  })
  inProject(on)
  mock.clock(on, { now: Date.now() })
  return files
}

const call = async ($: { tool: { call(a: never): Promise<unknown> } }, tool: string, args: Record<string, unknown>) => {
  const r = (await $.tool.call({ tool: `mcp__symcc__${tool}`, ...args } as never)) as { result?: string } | string
  return String(typeof r === 'string' ? r : r?.result ?? '')
}

const wish = { title: 'Owner wish', details: 'd', why: 'asked', origin_by: 'owner', request: 'do it' }

test('the lead guide says: in mode review, ask the owner before every add', () => {
  const guide = leadGuide()
  expect(guide).toContain(`In mode "review", ask the owner before every ${S.N.name} add`)
  expect(guide).toContain("the owner's words, a scout finding, a worker's report, your own idea")
  expect(guide).toContain('add it only after a yes')
  expect(guide).toContain('In mode "auto" you add tasks as usual')
  expect(guide).toContain('need no asking')
})

test('mode review: the add answer reminds the lead to have the owner\'s yes, and still adds the task', async ($, on) => {
  const files = setup(on, { tasks: [], mode: 'review' })
  const out = await call($, 'add', wish)
  expect(out).toContain('added T-1 Owner wish')
  expect(out).toContain(REVIEW_ADD_REMINDER.trim())
  expect(JSON.parse(files['/board.json']!).tasks.map((t: { id: string }) => t.id)).toEqual(['T-1'])
})

test('mode auto (and the default): the add answer has no reminder', async ($, on) => {
  setup(on, { tasks: [], mode: 'auto' })
  expect(await call($, 'add', wish)).not.toContain('Review mode:')
})

test('no mode set: the add answer has no reminder', async ($, on) => {
  setup(on, { tasks: [] })
  expect(await call($, 'add', wish)).not.toContain('Review mode:')
})
