import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

declare const setTimeout: (fn: (v?: unknown) => void, ms: number) => unknown

// Stands in for the project folder, the agent registry and Claude Code's Task tools.
function world(on: On) {
  const files = new Map<string, string>()
  const native: { id: string; subject: string; status: string }[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({ value: { root: '/p', remote: null, internal: false, name: 'p' } as never }))
  on('ui.status', () => ({ value: undefined }))
  on('fs.exists', (_, e) => ({ value: files.has(e.path) || [...files.keys()].some(k => k.startsWith(e.path + '/')) }))
  on('fs.read', (_, e) => (files.has(e.path) ? { value: files.get(e.path)! } : { value: '' }))
  on('fs.write', (_, e) => (files.set(e.path, e.text), { value: undefined }))
  on('fs.list', () => ({ value: [] }))
  on('agent.register', (_, e) => ({ value: { agent: `symcc:${e.name}` } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__symcc__${e.name}` } }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'no git here', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('tool.call', { tool: 'TaskCreate' }, (_, e) => {
    const id = String(native.length + 1)
    native.push({ id, subject: String((e as { subject: string }).subject), status: 'pending' })
    return { result: { task: { id, subject: String((e as { subject: string }).subject) } } }
  })
  on('tool.call', { tool: 'TaskUpdate' }, (_, e) => {
    const x = e as { taskId: string; status?: string; subject?: string }
    const n = native.find(t => t.id === x.taskId)!
    if (x.status) n.status = x.status
    if (x.subject) n.subject = x.subject
    return { result: { success: true, taskId: x.taskId, updatedFields: [] } }
  })
  return { files, native }
}

test("the board shows in Claude Code's own task list, and its statuses follow", async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__symcc__settings', paused: true })
  await $.tool.call({ tool: 'mcp__symcc__add', title: 'Parser', details: 'parse it', files: ['src/p.js'] })
  await $.tool.call({ tool: 'mcp__symcc__add', title: 'Search', details: 'search it' })
  await $.tool.call({ tool: 'mcp__symcc__ask', task: 'T-2', question: 'Case-sensitive?' })
  await $.tool.call({ tool: 'mcp__symcc__drop', task: 'T-1' })
  for (let i = 0; i < 50 && w.native.length < 2; i++) await new Promise(r => setTimeout(r, 10))
  await new Promise(r => setTimeout(r, 30))
  expect(w.native.map(t => [t.subject, t.status])).toEqual([
    ['T-1 Parser', 'deleted'],
    ['T-2 Search (waiting for you)', 'pending'],
  ])
})
