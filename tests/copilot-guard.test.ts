// T-958: Copilot CLI's onPreToolUse input ({ toolName, toolArgs }) goes through symcc's own edit and shell checks
// (hooks/copilot/guard.ts). apply_patch's raw patch text gives its files (add, update, delete, move), bash's command
// is judged as a shell command and, for an agent, wrapped to run from its own folder, read-only tools pass, and an agent's tool the guard doesn't know is refused.
import { expect } from 'claude-code/testing'
import { addTask, emptyBoard, patchTask, blockedEditText, bashOutsideText } from '../hooks/board'
import { runBy } from './agent-fixture'
import { S, workers, toolName } from '../hooks/app/state'
import { ASK_TOOL } from '../hooks/core/ask'
import { copilotTouches, patchFiles, preToolUse, knownTool, unknownToolText, splitShellText, patchNoFilesText, patchOddHeader, patchOddText, shellWrap, shellUnreadText } from '../hooks/copilot/guard'
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

test("apply_patch as a JSON text is read from its input/patch field; an agent's patch with no file line is refused", async () => {
  const host = world()
  // the checker's probe: a JSON text whose input reaches the owner's copy was allowed
  const json = JSON.stringify({ input: patch('*** Add File: /repo/README.md', '+x') })
  expect(copilotTouches(WT, 'apply_patch', json)).toEqual([{ path: '/repo/README.md' }])
  const out = await preToolUse(host, WT, 'ag1', { toolName: 'apply_patch', toolArgs: json })
  expect(out?.permissionDecisionReason).toMatch(/^Refused: README\.md is in the owner's copy/)
  expect((await preToolUse(host, WT, 'ag1', { toolName: 'apply_patch', toolArgs: JSON.stringify({ patch: patch('*** Update File: src/b.ts') }) }))?.permissionDecisionReason).toBe(blockedEditText('src/b.ts'))
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'apply_patch', toolArgs: JSON.stringify({ input: patch('*** Update File: src/a.ts') }) })).toBe(undefined)
  // no file line found anywhere: refused for an agent, whatever the shape
  const none = { permissionDecision: 'deny', permissionDecisionReason: patchNoFilesText }
  for (const toolArgs of ['', patch('+x'), JSON.stringify({ input: 'x' }), JSON.stringify({ other: patch('*** Add File: a') }), { input: 42 }, null]) {
    expect(await preToolUse(host, WT, 'ag1', { toolName: 'apply_patch', toolArgs })).toEqual(none)
  }
  // the lead is unchanged
  expect(await preToolUse(host, ROOT, undefined, { toolName: 'apply_patch', toolArgs: patch('+x') })).toBe(undefined)
  workers.clear()
})

test("apply_patch headers are read like Copilot's reader: lines split on \\n only, any Unicode space before '***'; odd characters refused", async () => {
  const host = world()
  const odd = { permissionDecision: 'deny', permissionDecisionReason: patchOddText }
  // the checker's first probe: a \r (or \u2028, \u2029, \u0085) inside a header hid the rest of the path
  for (const c of ['\r', '\u2028', '\u2029', '\u0085', '\u0000', '\u001b', '\ufeff']) {
    const text = patch(`*** Add File: src/a.ts${c}/../../../../../README.md`, '+x')
    expect(patchFiles(text)).toEqual([`src/a.ts${c}/../../../../../README.md`])
    expect(patchOddHeader(text)).toBe(true)
    expect(await preToolUse(host, WT, 'ag1', { toolName: 'apply_patch', toolArgs: text })).toEqual(odd)
    expect(await preToolUse(host, WT, 'ag1', { toolName: 'apply_patch', toolArgs: { input: text } })).toEqual(odd)
  }
  // the checker's second probe: a header after a Unicode space, next to a listed file's header, was not seen
  for (const c of ['\u00a0', '\u2003', '\u3000', '\u1680', '\u202f', '\v', '\f', '\u0085', ' \t']) {
    const text = patch(`${c}*** Add File: /repo/README.md`, '+x', '*** Update File: src/a.ts', '@@', '-1', '+2')
    expect(patchFiles(text)).toEqual(['/repo/README.md', 'src/a.ts'])
    const out = await preToolUse(host, WT, 'ag1', { toolName: 'apply_patch', toolArgs: text })
    expect(out?.permissionDecision).toBe('deny')
  }
  // Unicode spaces between the header's words and around the path are read too
  expect(patchFiles(patch('***\u00a0Add\u2003File:\u3000/repo/README.md\u00a0'))).toEqual(['/repo/README.md'])
  // a plain listed-file patch still passes; Windows line ends are refused for an agent but not for the lead
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'apply_patch', toolArgs: patch('*** Update File: src/a.ts', '@@', '-1', '+2') })).toBe(undefined)
  const crlf = '*** Begin Patch\r\n*** Update File: src/a.ts\r\n*** End Patch'
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'apply_patch', toolArgs: crlf })).toEqual(odd)
  expect(await preToolUse(host, ROOT, undefined, { toolName: 'apply_patch', toolArgs: crlf })).toBe(undefined)
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

test('bash: a write outside the folder is denied, one inside passes',async () => {
  const host = world()
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'bash', toolArgs: { command: 'echo x > /repo/README.md' } })).toEqual({ permissionDecision: 'deny', permissionDecisionReason: bashOutsideText('README.md', WT) })
  // one inside passes, wrapped to run from the folder (see the wrap test below)
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'bash', toolArgs: { command: `echo x > ${WT}/src/a.ts` } })).toEqual({ modifiedArgs: { command: shellWrap(WT, 'bash', `echo x > ${WT}/src/a.ts`) } })
  expect((await preToolUse(host, WT, 'ag1', { toolName: 'powershell', toolArgs: { command: 'echo x > /repo/README.md' } }))?.permissionDecision).toBe('deny')
  // an argument list (local_shell's) is quoted into one line, so the same words are judged
  expect(copilotTouches(WT, 'local_shell', { command: ['sh', '-c', 'echo x > /repo/README.md'] })).toEqual([{ command: "sh -c 'echo x > /repo/README.md'" }])
  workers.clear()
})

test("an agent's shell call is wrapped to run in a new shell from its own folder, so the session shell never moves", async () => {
  const host = world()
  const wrapped = (tool: string, command: string | string[], extra: Record<string, unknown> = {}) => ({ modifiedArgs: { ...extra, command: shellWrap(WT, tool, command) } })
  // the checkers' ways out of the folder over two calls: each call now starts from the folder again (real bash, in the
  // hand-back's probe, prints the folder after each of these), so they pass, wrapped
  for (const command of ['cd /', 'cd ~', 'cd', 'cd -', 'cd src', 'cd ./src && ls', 'exec bash -c "cd /; exec bash"', 'f() { cd /; }; alias ls="cd /"', 'shopt -s autocd']) {
    expect([command, await preToolUse(host, WT, 'ag1', { toolName: 'bash', toolArgs: { command } })]).toEqual([command, wrapped('bash', command)])
  }
  // a cd to a path built from a variable can't be checked, so it is refused (T-963)
  expect((await preToolUse(host, WT, 'ag1', { toolName: 'bash', toolArgs: { command: 'cd $HOME' } }))?.permissionDecision).toBe('deny')
  // the bash form: cd into the folder, then the command as one quoted word to a new bash with no input, so a ")" or an
  // open here-document in it can't end the wrap and run the rest in the session shell
  expect(shellWrap(WT, 'bash', 'ls')).toBe(`( cd -- '${WT}' || exit 1\nexec bash -c 'ls'\n) </dev/null`)
  expect(shellWrap("/w/it's", 'bash', "x\n) ; cd /; cat <<'EOF'")).toBe(`( cd -- '/w/it'\\''s' || exit 1\nexec bash -c 'x\n) ; cd /; cat <<'\\''EOF'\\'''\n) </dev/null`)
  // PowerShell: the folder and command go in -EncodedCommand (UTF-16LE base64) to a new PowerShell with no input
  expect(shellWrap('/w', 'powershell', 'dir')).toBe('$null | & (Get-Process -Id $PID).Path -NoProfile -NonInteractive -EncodedCommand UwBlAHQALQBMAG8AYwBhAHQAaQBvAG4AIAAtAEwAaQB0AGUAcgBhAGwAUABhAHQAaAAgACcALwB3ACcAIAAtAEUAcgByAG8AcgBBAGMAdABpAG8AbgAgAFMAdABvAHAACgBkAGkAcgA=')
  // local_shell's argument list runs as is from the folder; other fields are kept; a JSON text comes back as one
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'local_shell', toolArgs: { command: ['ls', '-l'], timeout_ms: 5 } })).toEqual(wrapped('local_shell', ['ls', '-l'], { timeout_ms: 5 }))
  expect(shellWrap(WT, 'local_shell', ['ls', '-l'])).toEqual(['bash', '-c', 'cd -- "$0" || exit 1\nexec "$@"', WT, 'ls', '-l'])
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'powershell', toolArgs: JSON.stringify({ command: 'dir', description: 'd' }) })).toEqual({ modifiedArgs: JSON.stringify({ command: shellWrap(WT, 'powershell', 'dir'), description: 'd' }) })
  // every call is judged from the folder by the shared check, a cd inside the command included
  expect((await preToolUse(host, WT, 'ag1', { toolName: 'bash', toolArgs: { command: 'echo x > ../../../README.md' } }))?.permissionDecision).toBe('deny')
  expect((await preToolUse(host, WT, 'ag1', { toolName: 'bash', toolArgs: { command: 'cd / && echo x > repo/README.md' } }))?.permissionDecision).toBe('deny')
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'bash', toolArgs: { command: 'echo x > src/a.ts' } })).toEqual(wrapped('bash', 'echo x > src/a.ts'))
  // a command that can't be read is refused, not run unwrapped
  for (const command of [{ x: 1 }, 42, [], [1], undefined]) {
    expect(await preToolUse(host, WT, 'ag1', { toolName: 'bash', toolArgs: { command } })).toEqual({ permissionDecision: 'deny', permissionDecisionReason: shellUnreadText })
  }
  // the lead is unchanged: not wrapped
  expect(await preToolUse(host, ROOT, undefined, { toolName: 'bash', toolArgs: { command: 'cd /' } })).toBe(undefined)
  workers.clear()
})

test("an agent may not type into a running shell or start one by id, so a command can't be split over calls", async () => {
  const host = world()
  const refused = { permissionDecision: 'deny', permissionDecisionReason: splitShellText }
  // write_bash / write_powershell are refused, even harmless text
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'write_bash', toolArgs: { shellId: 's1', input: 'ls\n' } })).toEqual(refused)
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'write_powershell', toolArgs: { shellId: 's1', input: 'dir\n' } })).toEqual(refused)
  // a bash or powershell call with a shellId or async is refused: the checker's split (bash half, then write_bash half)
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'bash', toolArgs: { command: 'echo x > /re\\', shellId: 's5', async: true } })).toEqual(refused)
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'bash', toolArgs: { command: 'po/README.md', shellId: 's10' } })).toEqual(refused)
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'bash', toolArgs: { command: 'ls', async: true } })).toEqual(refused)
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'powershell', toolArgs: { command: 'dir', shellId: 0 } })).toEqual(refused)
  // a plain bash call is checked whole as before, async: false included
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'bash', toolArgs: { command: 'ls', async: false } })).toEqual({ modifiedArgs: { command: shellWrap(WT, 'bash', 'ls'), async: false } })
  expect((await preToolUse(host, WT, 'ag1', { toolName: 'bash', toolArgs: { command: 'echo x > /repo/README.md' } }))?.permissionDecisionReason).toBe(bashOutsideText('README.md', WT))
  // the lead is unchanged
  expect(await preToolUse(host, ROOT, undefined, { toolName: 'write_bash', toolArgs: { shellId: 's1', input: 'ls\n' } })).toBe(undefined)
  expect(await preToolUse(host, ROOT, undefined, { toolName: 'bash', toolArgs: { command: 'ls', shellId: 's1', async: true } })).toBe(undefined)
  workers.clear()
})

test('read-only tools pass, even for paths outside the folder', async () => {
  const host = world()
  for (const [toolName, toolArgs] of [['view', { path: '/repo/README.md' }], ['rg', { pattern: 'x', paths: ['/repo'] }], ['glob', { pattern: '**/*' }], ['read_bash', { shellId: '1' }], ['web_fetch', { url: 'https://example.com' }]] as const) {
    expect(await preToolUse(host, WT, 'ag1', { toolName, toolArgs })).toBe(undefined)
  }
  workers.clear()
})

test("an agent's tool the guard doesn't know (an MCP tool, a newer built-in) is refused whatever its fields; odd input never throws", async () => {
  const host = world()
  const refused = (name: string) => ({ permissionDecision: 'deny', permissionDecisionReason: unknownToolText(name) })
  // the checker's fields that slipped past the old field-name guess, moves, nested paths, harmless-looking ones too
  for (const toolArgs of [{ dataPath: '/repo/README.md' }, { contextFile: '/repo/README.md' }, { contentPath: '/repo/x' }, { source: '/repo/README.md', destination: '/tmp/y' }, { edits: [{ targetFile: '/repo/README.md' }] }, { query: 'hello' }, {}]) {
    expect(await preToolUse(host, WT, 'ag1', { toolName: 'mcp_fs_write', toolArgs })).toEqual(refused('mcp_fs_write'))
  }
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'write_agent', toolArgs: { text: 'hi' } })).toEqual(refused('write_agent'))
  // no name or no input at all is refused too, and never throws
  expect(await preToolUse(host, WT, 'ag1', { toolName: 42, toolArgs: null })).toEqual(refused(''))
  expect(await preToolUse(host, WT, 'ag1', undefined)).toEqual(refused(''))
  expect(knownTool('mcp_fs_write')).toBe(false)
  for (const t of ['apply_patch', 'edit', 'create', 'str_replace_editor', 'str_replace', 'bash', 'powershell', 'local_shell', 'view', 'rg', 'glob', 'read_bash', 'web_fetch', toolName(ASK_TOOL), toolName('board')]) expect(knownTool(t)).toBe(true)
  // symcc's own tools pass the guard (their handler runs symcc's toolCall, which judges them)
  expect(await preToolUse(host, WT, 'ag1', { toolName: toolName(ASK_TOOL), toolArgs: { question: 'q' } })).toBe(undefined)
  // the hidden str_replace edit tool is checked by its path like edit
  expect((await preToolUse(host, WT, 'ag1', { toolName: 'str_replace', toolArgs: { path: '/repo/README.md', old_str: 'a', new_str: 'b' } }))?.permissionDecision).toBe('deny')
  expect(await preToolUse(host, WT, 'ag1', { toolName: 'str_replace', toolArgs: { path: 'src/a.ts', old_str: 'a', new_str: 'b' } })).toBe(undefined)
  // odd argument shapes of known tools: nothing to check, no error
  expect(copilotTouches(WT, 'edit', { path: ['a'] })).toEqual([])
  expect(copilotTouches(WT, 'bash', { command: { x: 1 } })).toEqual([])
  expect(copilotTouches(WT, 'mcp_fs_write', { path: '/repo/README.md' })).toEqual([])
  // a JSON text of the arguments is read like the object
  expect(copilotTouches(WT, 'edit', JSON.stringify({ path: 'src/b.ts' }))).toEqual([{ path: `${WT}/src/b.ts` }])
  // the lead may still use a tool the guard doesn't know
  expect(await preToolUse(host, ROOT, undefined, { toolName: 'mcp_fs_write', toolArgs: { dataPath: '/repo/README.md' } })).toBe(undefined)
  workers.clear()
})

test("the lead (no agent id) is never refused, even for a write outside a task's folder", async () => {
  const host = world()
  expect(await preToolUse(host, ROOT, undefined, { toolName: 'apply_patch', toolArgs: patch('*** Update File: README.md') })).toBe(undefined)
  expect(await preToolUse(host, ROOT, undefined, { toolName: 'bash', toolArgs: { command: 'echo x > /tmp/y' } })).toBe(undefined)
  workers.clear()
})
