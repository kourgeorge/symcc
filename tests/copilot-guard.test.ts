// T-958: Copilot CLI's onPreToolUse input ({ toolName, toolArgs }) goes through symcc's own edit and shell checks
// (hooks/copilot/guard.ts). apply_patch's raw patch text gives its files (add, update, delete, move), bash's command
// is judged as a shell command, read-only tools pass, and a tool symcc doesn't know still has its paths checked.
import { expect } from 'claude-code/testing'
import { addTask, emptyBoard, patchTask, blockedEditText, bashOutsideText } from '../hooks/board'
import { runBy } from './agent-fixture'
import { S, workers } from '../hooks/app/state'
import { copilotTouches, patchFiles, preToolUse } from '../hooks/copilot/guard'
import { test } from './reset'
import { fakeHost, memoryFs, done } from './fake-host'

const ROOT = '/repo'
const WT = `${ROOT}/.symcc/worktrees/T-1`

/** A fake host with a board whose task T-1 (files: src/a.ts) is being done by worker "ag1" in WT. */
function world() {
  const files = new Map<string, string>()
  const at = '2026-11-18T00:00:00.000Z'
  const [added] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'a change', files: ['src/a.ts'] }, at)
  const b = patchTask(added, 'T-1', { status: 'doing', runs: [runBy('ag1', at)], live: { session: 'driver' } }, at)
  files.set(`${ROOT}/.symcc/board.json`, JSON.stringify(b))
  const { host } = fakeHost({
    session: { id: async () => 'lead', repo: async () => ({ root: ROOT }), root: async () => ROOT },
    fs: memoryFs(files),
    run: async () => done(),
  })
  S.root = ROOT
  workers.set('ag1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: Date.now() })
  return host
}

const patch = (...lines: string[]) => ['*** Begin Patch', ...lines, '*** End Patch'].join('\n')

test('apply_patch: the add, update, delete and move lines give the files, relative ones from the folder', () => {
  const text = patch('*** Add File: src/new.ts', '+x', '*** Update File: src/a.ts', '*** Move to: lib/b.ts', '@@', '-1', '+2', '*** Delete File: /repo/README.md')
  expect(patchFiles(text)).toEqual(['src/new.ts', 'src/a.ts', 'lib/b.ts', '/repo/README.md'])
  expect(copilotTouches(WT, 'apply_patch', text)).toEqual([{ path: `${WT}/src/new.ts` }, { path: `${WT}/src/a.ts` }, { path: `${WT}/lib/b.ts` }, { path: '/repo/README.md' }])
  // the CLI also reads {input} or {patch}; Windows line ends and odd spacing don't hide a header
  expect(copilotTouches(WT, 'apply_patch', { input: patch('*** Add File: c.ts') })).toEqual([{ path: `${WT}/c.ts` }])
  expect(copilotTouches(WT, 'apply_patch', { patch: '*** Begin Patch\r\n  ***  update   file:  d.ts\r\n*** End Patch' })).toEqual([{ path: `${WT}/d.ts` }])
  // ".." is followed to where it really points
  expect(copilotTouches(WT, 'apply_patch', patch('*** Add File: ../../../README.md'))).toEqual([{ path: '/repo/README.md' }])
})

test("apply_patch through preToolUse: inside the task's files passes, any other file is denied with symcc's reason", async () => {
  const host = world()
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'apply_patch', toolArgs: patch('*** Update File: src/a.ts', '@@', '-1', '+2') })).toBe(undefined)
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'apply_patch', toolArgs: patch('*** Add File: src/b.ts', '+x') })).toEqual({ permissionDecision: 'deny', permissionDecisionReason: blockedEditText('src/b.ts') })
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'apply_patch', toolArgs: patch('*** Delete File: README.md') })).toEqual({ permissionDecision: 'deny', permissionDecisionReason: blockedEditText('README.md') })
  // a move is checked at both ends: from a listed file to an unlisted one is denied
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'apply_patch', toolArgs: patch('*** Update File: src/a.ts', '*** Move to: src/c.ts') })).toEqual({ permissionDecision: 'deny', permissionDecisionReason: blockedEditText('src/c.ts') })
  // a patch reaching the owner's copy is denied as outside the folder
  const out = await preToolUse(host, WT, 'ag1', { toolName: 'apply_patch', toolArgs: patch('*** Update File: /repo/README.md') })
  expect(out?.permissionDecision).toBe('deny')
  expect(out?.permissionDecisionReason).toMatch(/^Refused: README\.md is in the owner's copy/)
  workers.clear()
})

test('edit, create and str_replace_editor are checked by their path; str_replace_editor view only reads', async () => {
  const host = world()
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'edit', toolArgs: { path: `${WT}/src/a.ts`, old_str: '1', new_str: '2' } })).toBe(undefined)
  expect((await preToolUse(host, WT, 'ag1', { toolName: 'create', toolArgs: { path: `${WT}/src/z.ts`, file_text: 'x' } }))?.permissionDecisionReason).toBe(blockedEditText('src/z.ts'))
  expect((await preToolUse(host, WT, 'ag1', { toolName: 'str_replace_editor', toolArgs: { command: 'insert', path: 'src/z.ts', insert_line: 1, new_str: 'x' } }))?.permissionDecisionReason).toBe(blockedEditText('src/z.ts'))
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'str_replace_editor', toolArgs: { command: 'view', path: '/repo/README.md' } })).toBe(undefined)
  workers.clear()
})

test('bash: a write outside the folder is denied, one inside passes; text typed into a running shell is judged too', async () => {
  const host = world()
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'bash', toolArgs: { command: 'echo x > /repo/README.md' } })).toEqual({ permissionDecision: 'deny', permissionDecisionReason: bashOutsideText('README.md', WT) })
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'bash', toolArgs: { command: `echo x > ${WT}/src/a.ts` } })).toBe(undefined)
  expect((await preToolUse(host, WT, 'ag1', { toolName: 'write_bash', toolArgs: { shellId: '1', input: 'echo x > /repo/README.md\n' } }))?.permissionDecisionReason).toBe(bashOutsideText('README.md', WT))
  expect((await preToolUse(host, WT, 'ag1', { toolName: 'powershell', toolArgs: { command: 'echo x > /repo/README.md' } }))?.permissionDecision).toBe('deny')
  // Copilot's bash session lives on between calls, so moving it out of the folder is refused in the first place
  expect((await preToolUse(host, WT, 'ag1', { toolName: 'bash', toolArgs: { command: 'cd /repo' } }))?.permissionDecision).toBe('deny')
  expect((await preToolUse(host, WT, 'ag1', { toolName: 'bash', toolArgs: { command: 'cd ../../..' } }))?.permissionDecision).toBe('deny')
  // an argument list (local_shell's) is quoted into one line, so the same words are judged
  expect(copilotTouches(WT, 'local_shell', { command: ['sh', '-c', 'echo x > /repo/README.md'] })).toEqual([{ command: "sh -c 'echo x > /repo/README.md'" }])
  workers.clear()
})

test('read-only tools pass, even for paths outside the folder', async () => {
  const host = world()
  for (const [toolName, toolArgs] of [['view', { path: '/repo/README.md' }], ['rg', { pattern: 'x', paths: ['/repo'] }], ['glob', { pattern: '**/*' }], ['read_bash', { shellId: '1' }], ['web_fetch', { url: 'https://example.com' }]] as const) {
    expect(await preToolUse(host, WT, 'ag1', { toolName, toolArgs })).toBe(undefined)
  }
  workers.clear()
})

test("a tool symcc doesn't know has its path and command fields checked; odd input never throws or slips through", async () => {
  const host = world()
  expect(copilotTouches(WT, 'mcp_write', { file_path: 'src/a.ts', paths: ['/repo/x', 3], cmd: 'ls' })).toEqual([{ path: `${WT}/src/a.ts` }, { path: '/repo/x' }, { command: 'ls' }])
  expect((await preToolUse(host, WT, 'ag1', { toolName: 'some_mcp_write', toolArgs: { filePath: `${ROOT}/README.md`, content: 'x' } }))?.permissionDecision).toBe('deny')
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'some_mcp_tool', toolArgs: { query: 'hello' } })).toBe(undefined)
  // no name, odd argument shapes: nothing to check, no error
  expect(await preToolUse(host, WT, 'ag1', { toolName: 42, toolArgs: null })).toBe(undefined)
  expect(await preToolUse(host, WT, 'ag1', undefined)).toBe(undefined)
  expect(copilotTouches(WT, 'edit', { path: ['a'] })).toEqual([])
  expect(copilotTouches(WT, 'bash', { command: { x: 1 } })).toEqual([])
  // a JSON text of the arguments is read like the object
  expect(copilotTouches(WT, 'edit', JSON.stringify({ path: 'src/b.ts' }))).toEqual([{ path: `${WT}/src/b.ts` }])
  // a Copilot tool named like one of symcc's is never run as symcc's tool here: it is only judged
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'board', toolArgs: {} })).toBe(undefined)
  workers.clear()
})

test("the lead (no agent id) is never refused, even for a write outside a task's folder", async () => {
  const host = world()
  expect(await preToolUse(host, ROOT, undefined, { toolName: 'apply_patch', toolArgs: patch('*** Update File: README.md') })).toBe(undefined)
  expect(await preToolUse(host, ROOT, undefined, { toolName: 'bash', toolArgs: { command: 'echo x > /tmp/y' } })).toBe(undefined)
  workers.clear()
})
