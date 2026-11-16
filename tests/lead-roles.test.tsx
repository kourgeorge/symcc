import { expect } from 'claude-code/testing'
import { test } from './reset'
import { parseRole, roleChoices, rolesLeadText, checkRole } from '../hooks/board'
import { S, leadQueue, skippedRoles } from '../hooks/plugin/state'
import { leadGuide, manual, runTool } from '../hooks/plugin/tools'

const ROOT = '/proj'
const MINE = `${ROOT}/.symcc/roles`
const PLUGIN = '/plugin'

/**
 * A fake $ with fake roles folders: `builtIn` is the plugin's roles/ folder, `mine` is the project's .symcc/roles (file name -> text).
 * fs.write and `rm -f` change `mine`, so what the roles tool writes or deletes is seen by the next read.
 * `touched` is every path written or deleted.
 */
function setup(mine: Record<string, string> = {}) {
  const builtIn: Record<string, string> = {
    'general.md': '---\ndescription: a plain worker\n---\n',
    'tester.md': '---\ndescription: writes tests\nmodel: sonnet\n---\n- cover errors\n',
    'docs.md': '---\ndescription: writes the docs\n---\n- plain words\n',
  }
  const touched: string[] = []
  const where = (p: string): [Record<string, string>, string] | null => {
    if (p === MINE) return [mine, '']
    if (p.startsWith(`${MINE}/`)) return [mine, p.slice(MINE.length + 1)]
    if (p === `${PLUGIN}/roles`) return [builtIn, '']
    if (p.startsWith(`${PLUGIN}/roles/`)) return [builtIn, p.slice(PLUGIN.length + 7)]
    return null
  }
  const $ = {
    plugin: { root: PLUGIN },
    fs: {
      exists: async (p: string) => {
        const w = where(p)
        return !!w && (w[1] === '' || w[1] in w[0])
      },
      list: async (p: string) => {
        const w = where(p)
        return w && w[1] === '' ? Object.keys(w[0]).map(name => ({ name, kind: 'file' })) : []
      },
      read: async (p: string) => {
        const w = where(p)
        if (!w || !(w[1] in w[0])) throw new Error('no file')
        return w[0][w[1]]
      },
      write: async (p: string, text: string) => {
        touched.push(p)
        const w = where(p)
        if (w) w[0][w[1]] = String(text)
      },
    },
    process: {
      run: async (argv: string[]) => {
        if (argv[0] === 'rm') {
          const p = argv[argv.length - 1]!
          touched.push(p)
          const w = where(p)
          if (w) delete w[0][w[1]]
        }
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    },
    ui: { invalidate: () => undefined, toast: () => undefined, log: () => undefined, status: () => undefined },
    // A skipped role file tells the lead (through a timer); nothing is sent here.
    clock: { after: () => undefined },
  }
  S.root = ROOT
  S.roles = []
  return { $, builtIn, mine, touched }
}

/** Calls the lead's roles tool in this module (so it sees S.root and S.roles set here). */
const call = async ($: unknown, args: Record<string, unknown>) => String(await runTool($ as never, 'roles', args as never))

test('roles list shows every role and where it comes from; with name, one role in full', async () => {
  const { $ } = setup({ 'tester.md': '---\ndescription: my tests\n---\n- mine\n', 'mobile.md': '---\ndescription: phone apps\n---\n' })
  const list = await call($, {})
  expect(list).toContain('- general (built-in): a plain worker')
  expect(list).toContain('- docs (built-in): writes the docs')
  expect(list).toContain('- tester (replaced): my tests')
  expect(list).toContain('- mobile (added): phone apps')
  const one = await call($, { action: 'list', name: 'docs' })
  expect(one).toContain('docs (built-in): writes the docs')
  expect(one).toContain('description: writes the docs')
  expect(one).toContain('- plain words')
  expect(await call($, { name: 'nope' })).toContain('no role named nope')
})

test('roles add writes a valid role file; a taken name, a bad tool or no description is refused', async () => {
  const { $, mine } = setup()
  const out = await call($, { action: 'add', name: 'web_check', description: 'checks links', model: 'haiku', skills: ['review'], tools: ['websearch', 'WebFetch'], checklist: '- check every link' })
  expect(out).toContain('added role web_check (.symcc/roles/web_check.md)')
  expect(parseRole('web_check', mine['web_check.md']!)).toMatchObject({ description: 'checks links', model: 'haiku', skills: ['review'], tools: ['WebSearch', 'WebFetch'], prompt: '- check every link' })
  expect(S.roles.some(r => r.name === 'web_check')).toBe(true)
  expect(await call($, { action: 'add', name: 'web_check', description: 'x' })).toContain('already exists')
  expect(await call($, { action: 'add', name: 'docs', description: 'x' })).toContain('already exists')
  expect(await call($, { action: 'add', name: 'shell', description: 'x', tools: ['Bash'] })).toContain('unknown tool "Bash"')
  expect(await call($, { action: 'edit', name: 'web_check', tools: ['Agent'] })).toContain('unknown tool "Agent"')
  expect(await call($, { action: 'add', name: 'empty' })).toContain('description is missing')
  expect(Object.keys(mine)).toEqual(['web_check.md'])
})

test('roles edit changes what it is given and keeps the rest; editing a built-in makes a copy first', async () => {
  const { $, builtIn, mine } = setup({ 'mobile.md': '---\ndescription: phone apps\nmodel: sonnet\n---\n- test on a phone\n' })
  expect(await call($, { action: 'edit', name: 'mobile', description: 'phone and tablet apps' })).toContain('saved role mobile')
  expect(parseRole('mobile', mine['mobile.md']!)).toMatchObject({ description: 'phone and tablet apps', model: 'sonnet', prompt: '- test on a phone' })
  const before = builtIn['tester.md']
  const out = await call($, { action: 'edit', name: 'Tester', checklist: '- cover errors\n- no sleeps' })
  expect(out).toContain('copied the built-in role to .symcc/roles/tester.md first')
  expect(builtIn['tester.md']).toBe(before)
  expect(parseRole('tester', mine['tester.md']!)).toMatchObject({ description: 'writes tests', model: 'sonnet', prompt: '- cover errors\n- no sleeps' })
  expect(await call($, {})).toContain('- tester (replaced): writes tests')
  expect(await call($, { action: 'edit', name: 'nope', description: 'x' })).toContain('no role named nope')
})

test('a broken role file of the owner is never written over by edit, off or on; reset still deletes it', async () => {
  const broken = '---\nmodel: sonnet\n---\n- my own careful checklist\n- keep this\n'
  const { $, mine, touched } = setup({ 'tester.md': broken })
  for (const args of [{ action: 'edit', name: 'tester', checklist: '- other' }, { action: 'off', name: 'tester' }, { action: 'on', name: 'Tester' }]) {
    const out = await call($, args)
    expect(out).toContain(".symcc/roles/tester.md can't be read as a role: no description")
    expect(out).toContain('Fix the file, or use reset to go back to the built-in.')
    expect(out).not.toContain('copied the built-in')
    expect(mine['tester.md']).toBe(broken)
  }
  expect(touched).toEqual([])
  const reset = await call($, { action: 'reset', name: 'tester' })
  expect(reset).toContain('tester is the built-in role again')
  expect(reset).toContain('is deleted')
  expect(mine['tester.md']).toBeUndefined()
  leadQueue.splice(0)
  skippedRoles.clear()
})

test('the roles list shows broken files with why and the way out; add on a broken name says so', async () => {
  const { $ } = setup({ 'tester.md': '---\nmodel: sonnet\n---\n', 'mobile.md': 'no front matter\n' })
  const list = await call($, {})
  expect(list).toContain("- tester (your file can't be read: no description; .symcc/roles/tester.md): the built-in role is used meanwhile; fix the file, or action \"reset\" deletes it")
  expect(list).not.toContain('- tester (built-in)')
  expect(list).toContain("- mobile (your file can't be read: no front matter")
  expect(list).toContain('action "remove" deletes it')
  expect(await call($, { action: 'list', name: 'mobile' })).toContain("mobile (your file can't be read")
  expect(await call($, { action: 'add', name: 'mobile', description: 'x' })).toContain("is already there but can't be read: no front matter")
  expect(await call($, { action: 'remove', name: 'mobile' })).toContain('removed role mobile')
  leadQueue.splice(0)
  skippedRoles.clear()
})

test('roles reset brings the built-in back; an added role says to use remove, which deletes it', async () => {
  const { $, mine } = setup({ 'tester.md': '---\ndescription: my tests\n---\n', 'mobile.md': '---\ndescription: phone apps\n---\n' })
  expect(await call($, { action: 'reset', name: 'tester' })).toContain('tester is the built-in role again')
  expect(mine['tester.md']).toBeUndefined()
  expect(S.roles.find(r => r.name === 'tester')?.description).toBe('writes tests')
  expect(await call($, { action: 'reset', name: 'tester' })).toContain('already the built-in role')
  expect(await call($, { action: 'reset', name: 'mobile' })).toContain('use action "remove"')
  expect(await call($, { action: 'remove', name: 'docs' })).toContain('built-in role and can\'t be removed')
  expect(await call($, { action: 'remove', name: 'mobile' })).toContain('removed role mobile')
  expect(mine['mobile.md']).toBeUndefined()
  expect(await call($, {})).not.toContain('mobile')
})

test('an off role is not offered and not in the lead\'s roles; on brings it back; general can\'t be turned off', async () => {
  const { $, mine } = setup()
  const out = await call($, { action: 'off', name: 'docs' })
  expect(out).toContain('turned docs off')
  expect(out).toContain('copied the built-in role')
  expect(parseRole('docs', mine['docs.md']!)).toMatchObject({ description: 'writes the docs', off: true, prompt: '- plain words' })
  expect(await call($, {})).toContain('- docs (replaced, off): writes the docs')
  expect(roleChoices(S.roles)).toEqual(['general', 'tester'])
  expect(rolesLeadText(S.roles)).not.toContain('docs (writes the docs)')
  expect(leadGuide()).not.toContain('docs (writes the docs)')
  expect(() => checkRole(S.roles, 'docs')).toThrow('turned off')
  // a task that already has it still finds it, so its worker keeps running with the role
  expect(S.roles.find(r => r.name === 'docs')?.prompt).toBe('- plain words')
  expect(await call($, { action: 'off', name: 'docs' })).toContain('already off')
  expect(await call($, { action: 'off', name: 'general' })).toContain("general can't be turned off")
  expect(await call($, { action: 'on', name: 'docs' })).toContain('turned docs on again')
  expect(roleChoices(S.roles)).toEqual(['general', 'docs', 'tester'])
  expect(rolesLeadText(S.roles)).toContain('docs (writes the docs)')
})

test('the file name is the role\'s name: a name: line is ignored with a warning, and every action works on that file only', async () => {
  const qaTester = '---\nname: qa\ndescription: my tests\n---\n- mine\n'
  const { $, mine, touched } = setup({ 'tester.md': qaTester })
  const warning = "name: qa is ignored; the role's name is its file name, tester"
  expect(parseRole('tester', qaTester)).toMatchObject({ name: 'tester', description: 'my tests', warning })
  expect(parseRole('tester', '---\nname: tester\ndescription: my tests\n---\n')?.warning).toBeUndefined()
  const list = await call($, {})
  expect(list).toContain(`- tester (replaced): my tests · warning: ${warning}`)
  expect(list).not.toContain('- qa')
  expect(S.roles.find(r => r.name === 'tester')?.description).toBe('my tests')
  expect(S.roles.some(r => r.name === 'qa')).toBe(false)
  expect(await call($, { action: 'list', name: 'qa' })).toContain('no role named qa')
  expect(await call($, { action: 'remove', name: 'qa' })).toContain('no role named qa')
  expect(await call($, { action: 'edit', name: 'qa', description: 'x' })).toContain('no role named qa')
  expect(await call($, { action: 'list', name: 'tester' })).toContain(warning)
  expect(await call($, { action: 'off', name: 'tester' })).toContain('turned tester off')
  expect(parseRole('tester', mine['tester.md']!)).toMatchObject({ description: 'my tests', off: true, prompt: '- mine' })
  expect(await call($, { action: 'on', name: 'tester' })).toContain('turned tester on again')
  expect(await call($, { action: 'edit', name: 'tester', description: 'my own tests' })).toContain('saved role tester (.symcc/roles/tester.md)')
  expect(parseRole('tester', mine['tester.md']!)).toMatchObject({ name: 'tester', description: 'my own tests', prompt: '- mine' })
  expect(Object.keys(mine)).toEqual(['tester.md'])
  expect(await call($, { action: 'reset', name: 'tester' })).toContain('tester is the built-in role again')
  expect(mine['tester.md']).toBeUndefined()
  expect(new Set(touched)).toEqual(new Set([`${MINE}/tester.md`]))
  expect(S.roles.find(r => r.name === 'tester')?.description).toBe('writes tests')
})

test('roles refuses a name that could reach outside the roles folder, for every action', async () => {
  const { $, mine, touched } = setup({ 'mobile.md': '---\ndescription: phone apps\n---\n' })
  for (const bad of ['../x', '../../README', 'a/b', '..', '.', '/etc/passwd', 'a\\b', 'a b'])
    for (const action of ['list', 'add', 'edit', 'reset', 'remove', 'off', 'on']) expect(await call($, { action, name: bad, description: 'x' })).toContain('not a valid role name')
  expect(await call($, { action: 'edit' })).toContain('say which role to edit')
  expect(touched).toEqual([])
  expect(Object.keys(mine)).toEqual(['mobile.md'])
})

test('the lead\'s instructions and the help list name the roles tool', async () => {
  expect(leadGuide()).toContain('symcc roles')
  expect(manual('lead')).toContain('roles lists, adds, edits, resets')
})

test("the lead's instructions say when to add an investigation, that it always waits for the owner, and what to offer when it is answered", () => {
  const g = leadGuide()
  expect(g).toContain('add an investigation when the owner wants an answer, or input for a decision')
  expect(g).toContain('"is it possible ...", "should we ...", "how does X work"')
  expect(g).toContain('Add a change when a lasting result is needed')
  expect(g).toContain('A researcher task is an investigation unless you give kind: change.')
  expect(g).toContain('An investigation always waits for the owner to read its answer, even in mode auto')
  expect(g).toContain('Tell the owner the answer in the chat')
  expect(g).toContain('offer the three choices: Done, Keep as a note, Ask more')
  expect(rolesLeadText([parseRole('researcher', '---\ndescription: finds things out\n---\n')!])).toContain('A researcher task is an investigation unless you add it with kind: change')
})
