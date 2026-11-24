// T-706: the slash commands OpenCode's board sends for the buttons it lacked: a role's or kind's Remove, + New role,
// + New kind, Edit (one part of the file per command, or Save's several at once), + New scout and Set up git. Each is parsed here, then run with
// runCommand on one fake Host and done with the lead's own tool (runTool: roles, kinds, scouts, setup_git) on another,
// from the same start: the files written (or deleted) and the answers are the same.
import { expect } from 'claude-code/testing'
import { emptyBoard, parseCommand, NEW_ROLE_TEMPLATE, NEW_KIND_TEMPLATE, NEW_SCOUT_EVERY } from '../hooks/board'
import { S, leadQueue, meanwhile } from '../hooks/app/state'
import { saveBoard } from '../hooks/app/store'
import { runCommand } from '../hooks/app/symcc'
import { runTool } from '../hooks/app/tools'
import { test } from './reset'
import { fakeHost, memoryFs } from './fake-host'

const ROOT = '/repo'
const MAIN = 'e1'.repeat(20)

type Res = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Res => ({ exitCode: 0, stdout, stderr: '' })

/** A fake Host on a project with git set up (one commit) and an empty board; its files in `files`. */
async function world(start: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(start))
  const runGit = (a: string[]): Res => {
    const s = a.join(' ')
    if (s === '--version') return ok('git version 2.50.0')
    if (s === 'rev-parse --is-inside-work-tree') return ok('true')
    if (s === 'rev-parse --verify -q HEAD') return ok(MAIN)
    if (s === 'rev-parse --verify -q refs/heads/main') return ok(MAIN)
    if (a[0] === 'worktree' && a[1] === 'list') return ok(`worktree ${ROOT}\nbranch refs/heads/main\n`)
    return ok()
  }
  const { host } = fakeHost({
    run: async argv => {
      const [cmd, ...rest] = argv
      if (cmd === 'git') return runGit(rest)
      if (cmd === 'rm') return rest.filter(x => !x.startsWith('-')).forEach(p => files.delete(p)), ok()
      return ok()
    },
    fs: {
      ...memoryFs(files),
      exists: async p => files.has(p) || [...files.keys()].some(k => k.startsWith(`${p}/`)),
      list: async dir => [...files.keys()].filter(k => k.startsWith(`${dir}/`) && !k.slice(dir.length + 1).includes('/')).map(k => ({ name: k.slice(dir.length + 1), kind: 'file' as const, size: files.get(k)!.length, mtimeMs: 0, isLink: false })),
    },
    agents: { spawn: async () => Promise.reject(new Error('no agents in this world')) },
  })
  S.root = ROOT
  S.writing = Promise.resolve()
  S.driving = false
  S.enabledNow = true
  leadQueue.splice(0)
  meanwhile.splice(0)
  await saveBoard(host, emptyBoard())
  return { host, files }
}

/** The project's role, kind and scout files (what the commands and tools write). */
const defFiles = (files: Map<string, string>) => Object.fromEntries([...files].filter(([k]) => /\/\.symcc\/(roles|kinds|scouts)\/[^/]+\.md$/.test(k)).sort(([a], [b]) => a.localeCompare(b)))

/** Runs `command args` on one world and `tool(input)` on another, from the same files: both answers and files. */
async function both(start: Record<string, string>, command: string, args: string, tool: string, input: Record<string, unknown>) {
  const a = await world(start)
  const said = (await runCommand(a.host, command, args))!.text
  const b = await world(start)
  const told = await runTool(b.host, tool, input as never)
  return { said, told, cmd: defFiles(a.files), lead: defFiles(b.files) }
}

test('T-706: the new command forms parse: role|type <name> add, <name> remove, <name> edit <field> <value> ("none" clears a list or the model), <name> save {json}, scout <name> new, git setup; wrong ones give the usage line', () => {
  const p = (c: string, a: string) => parseCommand(c, a)
  expect(p('symcc-settings', 'role docs remove')).toEqual({ kind: 'def', def: 'role', name: 'docs', action: 'remove' })
  expect(p('symcc-settings', 'type chore remove')).toEqual({ kind: 'def', def: 'kind', name: 'chore', action: 'remove' })
  expect(p('symcc-settings', 'role docs add')).toEqual({ kind: 'def-add', def: 'role', name: 'docs' })
  expect(p('symcc-settings', 'type Chore add')).toEqual({ kind: 'def-add', def: 'kind', name: 'Chore' })
  // the word is "type" now; the old "kind" is not a settings word any more, and the usage says "type"
  expect(p('symcc-settings', 'kind Chore add')!.kind).toBe('bad')
  expect((p('symcc-settings', 'type Chore') as { message: string }).message).toContain('/symcc-settings type <name> on, off, reset or remove')
  // the name always comes first: a new role or task type may be named like an action word, and a role named "add" still
  // turns on and off
  for (const w of ['on', 'off', 'reset', 'remove', 'add', 'edit', 'save']) {
    expect(p('symcc-settings', `role ${w} add`)).toEqual({ kind: 'def-add', def: 'role', name: w })
    expect(p('symcc-settings', `type ${w} add`)).toEqual({ kind: 'def-add', def: 'kind', name: w })
  }
  expect(p('symcc-settings', 'role add off')).toEqual({ kind: 'def', def: 'role', name: 'add', action: 'off' })
  expect(p('symcc-settings', 'role add remove')).toEqual({ kind: 'def', def: 'role', name: 'add', action: 'remove' })
  // save: several fields in one edit (JSON, so a checklist's lines stay one line of text)
  expect(p('symcc-settings', 'role docs save {"description":"Docs","tools":"foo","checklist":"- one\\n- two"}')).toEqual({ kind: 'def-save', def: 'role', name: 'docs', fields: { description: 'Docs', tools: 'foo', checklist: '- one\n- two' } })
  expect(p('symcc-settings', 'type chore save {"body":""}')).toEqual({ kind: 'def-save', def: 'kind', name: 'chore', fields: { body: '' } })
  expect(p('symcc-settings', 'role docs edit description Writes  the docs')).toEqual({ kind: 'def-edit', def: 'role', name: 'docs', field: 'description', value: 'Writes  the docs' })
  expect(p('symcc-settings', 'role docs edit checklist - one\n- two')).toEqual({ kind: 'def-edit', def: 'role', name: 'docs', field: 'checklist', value: '- one\n- two' })
  expect(p('symcc-settings', 'role docs edit checklist')).toEqual({ kind: 'def-edit', def: 'role', name: 'docs', field: 'checklist', value: '' })
  for (const f of ['model', 'skills', 'tools']) expect(p('symcc-settings', `role docs edit ${f} none`)).toEqual({ kind: 'def-edit', def: 'role', name: 'docs', field: f, value: '' })
  expect(p('symcc-settings', 'role docs edit SKILLS tdd, docs')).toEqual({ kind: 'def-edit', def: 'role', name: 'docs', field: 'skills', value: 'tdd, docs' })
  expect(p('symcc-settings', 'type chore edit body Do it.')).toEqual({ kind: 'def-edit', def: 'kind', name: 'chore', field: 'body', value: 'Do it.' })
  expect(p('symcc-settings', 'git setup')).toEqual({ kind: 'setup-git' })
  expect(p('symcc-scout', 'lint new Look for  lint.')).toEqual({ kind: 'scout-new', name: 'lint', prompt: 'Look for  lint.' })
  // the name comes first: a new scout may be named like a scout word, and a scout named "new" keeps its own words
  for (const w of ['pause', 'resume', 'every', 'model', 'prompt', 'new']) expect(p('symcc-scout', `${w} new look`)).toEqual({ kind: 'scout-new', name: w, prompt: 'look' })
  expect(p('symcc-scout', 'new every 30')).toEqual({ kind: 'scout-edit', name: 'new', field: 'every', value: '30' })
  expect(p('symcc-scout', 'new pause')).toEqual({ kind: 'scout-pause', name: 'new', paused: true })
  expect(p('symcc-scout', 'new')).toEqual({ kind: 'scout', name: 'new' })
  // no words at all: the scouts view (T-934: /symcc-scouts is gone, /symcc-scout with no name does it)
  expect(p('symcc-scout', '')!.kind).toBe('scouts')
  for (const [c, a] of [['symcc-settings', 'role docs edit'], ['symcc-settings', 'role docs edit body x'], ['symcc-settings', 'type chore edit model x'], ['symcc-settings', 'role docs edit description'], ['symcc-settings', 'role add'], ['symcc-settings', 'role docs add x'], ['symcc-settings', 'role docs save'], ['symcc-settings', 'role docs save {"body":"x"}'], ['symcc-settings', 'type chore save {"tools":"web"}'], ['symcc-settings', 'role docs save {"description":" "}'], ['symcc-settings', 'role docs save {}'], ['symcc-settings', 'role docs save {"model":1}'], ['symcc-settings', 'role docs save [1]'], ['symcc-settings', 'role docs save {x'], ['symcc-settings', 'git'], ['symcc-settings', 'git setup now'], ['symcc-scout', 'lint new']] as const) {
    expect([a, p(c, a)!.kind]).toEqual([a, 'bad'])
  }
  expect((p('symcc-settings', 'role docs edit') as { message: string }).message).toContain('/symcc-settings role <name> add')
  expect((p('symcc-settings', 'git') as { message: string }).message).toContain('/symcc-settings git setup')
  expect((p('symcc-scout', 'lint new') as { message: string }).message).toContain('/symcc-scout <name> new <instructions>')
})

test('T-706: role add, edit and remove from the slash command do what the lead\'s roles tool does (the same files and words)', async () => {
  const add = await both({}, 'symcc-settings', 'role docs add', 'roles', { action: 'add', name: 'docs', ...NEW_ROLE_TEMPLATE })
  expect(add.said).toBe(add.told)
  expect(add.said).toContain('added role docs')
  expect(add.cmd).toEqual(add.lead)
  expect(Object.keys(add.cmd)).toEqual(['/repo/.symcc/roles/docs.md'])
  const made = add.cmd
  const edits: [string, Record<string, unknown>][] = [
    ['description Writes the docs', { description: 'Writes the docs' }],
    ['model sonnet', { model: 'sonnet' }],
    ['skills tdd, docs', { skills: 'tdd, docs' }],
    ['tools web', { tools: 'web' }],
    ['checklist - keep it short\n- link the code', { checklist: '- keep it short\n- link the code' }],
  ]
  let now = made
  for (const [words, part] of edits) {
    const e = await both(now, 'symcc-settings', `role docs edit ${words}`, 'roles', { action: 'edit', name: 'docs', ...part })
    expect([words, e.said]).toEqual([words, e.told])
    expect(e.said).toContain('saved role docs')
    expect([words, e.cmd]).toEqual([words, e.lead])
    expect(e.cmd).not.toEqual(now)
    now = e.cmd
  }
  // none clears the model, skills and tools, as the tool's empty value does
  for (const f of ['model', 'skills', 'tools']) {
    const e = await both(now, 'symcc-settings', `role docs edit ${f} none`, 'roles', { action: 'edit', name: 'docs', [f]: '' })
    expect([f, e.cmd]).toEqual([f, e.lead])
    expect(e.cmd).not.toEqual(now)
  }
  // save: several fields in one edit, as the lead's tool's edit with them all; a bad tool word saves none of them
  const saved = await both(made, 'symcc-settings', 'role docs save {"description":"Writes the docs","checklist":"- one\\n- two"}', 'roles', { action: 'edit', name: 'docs', description: 'Writes the docs', checklist: '- one\n- two' })
  expect(saved.said).toBe(saved.told)
  expect(saved.said).toContain('saved role docs')
  expect(saved.cmd).toEqual(saved.lead)
  expect(Object.values(saved.cmd)[0]).toContain('Writes the docs')
  const bad = await both(made, 'symcc-settings', 'role docs save {"description":"Writes the docs","tools":"foo"}', 'roles', { action: 'edit', name: 'docs', description: 'Writes the docs', tools: 'foo' })
  expect(bad.said).toBe(bad.told)
  expect(bad.said).toContain('unknown tool "foo"')
  expect(bad.cmd).toEqual(made)
  const rm = await both(now, 'symcc-settings', 'role docs remove', 'roles', { action: 'remove', name: 'docs' })
  expect(rm.said).toBe(rm.told)
  expect(rm.said).toContain('removed role docs')
  expect(rm.cmd).toEqual({})
  expect(rm.lead).toEqual({})
})

test('T-706: kind add, edit and remove from the slash command do what the lead\'s kinds tool does; a built-in task type is refused alike', async () => {
  const add = await both({}, 'symcc-settings', 'type chore add', 'kinds', { action: 'add', name: 'chore', ...NEW_KIND_TEMPLATE })
  expect(add.said).toBe(add.told)
  expect(add.cmd).toEqual(add.lead)
  expect(Object.keys(add.cmd)).toEqual(['/repo/.symcc/kinds/chore.md'])
  const body = await both(add.cmd, 'symcc-settings', 'type chore edit body Tidy one thing.', 'kinds', { action: 'edit', name: 'chore', body: 'Tidy one thing.' })
  expect(body.said).toBe(body.told)
  expect(body.cmd).toEqual(body.lead)
  expect(Object.values(body.cmd)[0]).toContain('Tidy one thing.')
  const rm = await both(body.cmd, 'symcc-settings', 'type chore remove', 'kinds', { action: 'remove', name: 'chore' })
  expect(rm.said).toBe(rm.told)
  expect(rm.cmd).toEqual({})
  const builtIn = await both({}, 'symcc-settings', 'type change remove', 'kinds', { action: 'remove', name: 'change' })
  expect(builtIn.said).toBe(builtIn.told)
  expect(builtIn.said).toContain("can't be removed")
})

test('T-706: /symcc-scout NAME new INSTRUCTIONS writes the scout\'s file as the lead\'s scouts tool\'s add does (every NEW_SCOUT_EVERY minutes)', async () => {
  const add = await both({}, 'symcc-scout', 'lint new Look for lint warnings.', 'scouts', { action: 'add', name: 'lint', every_minutes: NEW_SCOUT_EVERY, prompt: 'Look for lint warnings.' })
  expect(add.said).toBe(add.told)
  expect(add.said).toContain('added scout lint')
  expect(add.cmd).toEqual(add.lead)
  expect(Object.values(add.cmd)[0]).toContain(`every_minutes: ${NEW_SCOUT_EVERY}`)
  expect(Object.values(add.cmd)[0]).toContain('Look for lint warnings.')
})

test('T-706: /symcc-settings git setup runs the lead\'s setup_git (here git is set up already: the same answer)', async () => {
  const a = await world()
  const said = (await runCommand(a.host, 'symcc-settings', 'git setup'))!.text
  const b = await world()
  expect(said).toBe(await runTool(b.host, 'setup_git', {} as never))
  expect(said).toContain('git is set up already')
})
