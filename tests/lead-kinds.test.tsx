// The lead's kinds tool (T-329): managed like the roles (see lead-roles.test.tsx).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { parseKind, checkKind, kindNames, kindsLeadText } from '../hooks/board'
import { S, leadQueue, skippedKinds } from '../hooks/plugin/state'
import { leadGuide, manual, runTool } from '../hooks/plugin/tools'

const ROOT = '/proj'
const MINE = `${ROOT}/.symcc/kinds`
const PLUGIN = '/plugin'

/**
 * A fake $ with fake kinds folders: `builtIn` is the plugin's kinds/ folder, `mine` is the project's .symcc/kinds (file name -> text).
 * fs.write and `rm -f` change `mine`, so what the kinds tool writes or deletes is seen by the next read.
 */
function setup(mine: Record<string, string> = {}) {
  const builtIn: Record<string, string> = {
    'change.md': '---\ndescription: a general change\n---\nThe worker changes files.\n',
    'bug.md': '---\ndescription: something that works wrongly\n---\nWith a test that fails first.\n',
    'docs.md': '---\ndescription: documentation only\n---\n',
    'investigation.md': '---\ndescription: find an answer\n---\n',
  }
  const touched: string[] = []
  const where = (p: string): [Record<string, string>, string] | null => {
    if (p === MINE) return [mine, '']
    if (p.startsWith(`${MINE}/`)) return [mine, p.slice(MINE.length + 1)]
    if (p === `${PLUGIN}/kinds`) return [builtIn, '']
    if (p.startsWith(`${PLUGIN}/kinds/`)) return [builtIn, p.slice(PLUGIN.length + 7)]
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
  S.kinds = []
  return { $, builtIn, mine, touched }
}

/** Calls the lead's kinds tool. */
const call = async ($: unknown, args: Record<string, unknown>) => String(await runTool($ as never, 'kinds', args as never))

test('kinds list shows every kind and where it comes from; with name, one kind in full', async () => {
  const { $ } = setup({ 'bug.md': '---\ndescription: a defect\n---\n', 'chore.md': '---\ndescription: small upkeep\noff: true\n---\n' })
  const list = await call($, {})
  expect(list).toContain('- change (built-in): a general change')
  expect(list).toContain('- bug (replaced): a defect')
  expect(list).toContain('- chore (added, off): small upkeep')
  const one = await call($, { action: 'list', name: 'change' })
  expect(one).toContain('change (built-in): a general change')
  expect(one).toContain('file: kinds/change.md (in the plugin)')
  expect(one).toContain('The worker changes files.')
  expect(await call($, { name: 'nope' })).toContain('no kind named nope')
})

test('kinds add writes a kind file; a taken name, a bad name or no description is refused', async () => {
  const { $, mine } = setup()
  expect(await call($, { action: 'add', name: 'chore', description: 'small upkeep', body: 'Keep it short.' })).toContain('added kind chore (.symcc/kinds/chore.md)')
  expect(parseKind('chore', mine['chore.md']!)).toEqual({ name: 'chore', description: 'small upkeep', body: 'Keep it short.' })
  expect(checkKind(S.kinds, 'chore')).toBe('chore')
  expect(await call($, { action: 'add', name: 'chore', description: 'x' })).toContain('already exists')
  expect(await call($, { action: 'add', name: 'bug', description: 'x' })).toContain('already exists')
  expect(await call($, { action: 'add', name: 'empty' })).toContain('description is missing')
  expect(Object.keys(mine)).toEqual(['chore.md'])
})

test('kinds edit keeps what it is not given; editing a built-in makes a copy first', async () => {
  const { $, builtIn, mine } = setup()
  const before = builtIn['bug.md']
  const out = await call($, { action: 'edit', name: 'Bug', description: 'a defect' })
  expect(out).toContain('saved kind bug (.symcc/kinds/bug.md) (copied the built-in kind to .symcc/kinds/bug.md first)')
  expect(builtIn['bug.md']).toBe(before)
  expect(parseKind('bug', mine['bug.md']!)).toEqual({ name: 'bug', description: 'a defect', body: 'With a test that fails first.' })
  expect(await call($, {})).toContain('- bug (replaced): a defect')
  expect(await call($, { action: 'edit', name: 'nope', description: 'x' })).toContain('no kind named nope')
})

test('kinds reset brings the built-in back; remove deletes an added kind and refuses a built-in', async () => {
  const { $, mine } = setup({ 'bug.md': '---\ndescription: a defect\n---\n', 'chore.md': '---\ndescription: small upkeep\n---\n' })
  expect(await call($, { action: 'reset', name: 'bug' })).toContain('bug is the built-in kind again')
  expect(mine['bug.md']).toBeUndefined()
  expect(S.kinds.find(k => k.name === 'bug')?.description).toBe('something that works wrongly')
  expect(await call($, { action: 'reset', name: 'bug' })).toContain('already the built-in kind')
  expect(await call($, { action: 'reset', name: 'chore' })).toContain('use action "remove"')
  expect(await call($, { action: 'remove', name: 'docs' })).toContain("built-in kind and can't be removed")
  expect(await call($, { action: 'remove', name: 'chore' })).toContain('removed kind chore')
  expect(mine['chore.md']).toBeUndefined()
  expect(await call($, {})).not.toContain('chore')
})

test("an off kind is not offered to the lead and refused; on brings it back; change and investigation can't be turned off", async () => {
  const { $, mine } = setup()
  const out = await call($, { action: 'off', name: 'bug' })
  expect(out).toContain('turned bug off')
  expect(out).toContain('copied the built-in kind')
  expect(parseKind('bug', mine['bug.md']!)).toMatchObject({ description: 'something that works wrongly', off: true, body: 'With a test that fails first.' })
  expect(await call($, {})).toContain('- bug (replaced, off): something that works wrongly')
  expect(kindNames(S.kinds)).toEqual(['change', 'docs', 'investigation'])
  expect(kindsLeadText(S.kinds)).not.toContain('bug')
  expect(() => checkKind(S.kinds, 'bug')).toThrow('kind "bug" is turned off')
  expect(await call($, { action: 'off', name: 'bug' })).toContain('already off')
  expect(await call($, { action: 'off', name: 'change' })).toContain("change can't be turned off")
  expect(await call($, { action: 'off', name: 'investigation' })).toContain("investigation can't be turned off")
  expect(await call($, { action: 'on', name: 'bug' })).toContain('turned bug on again')
  expect(checkKind(S.kinds, 'bug')).toBe('bug')
  // an off: true written by hand into change.md is ignored
  expect(parseKind('change', '---\ndescription: x\noff: true\n---\n')!.off).toBeUndefined()
})

test('a broken kind file of the owner is never written over; reset still deletes it', async () => {
  const broken = '---\nnothing: here\n---\nkeep this\n'
  const { $, mine, touched } = setup({ 'bug.md': broken })
  expect(await call($, {})).toContain("- bug (your file can't be read: no description; .symcc/kinds/bug.md)")
  for (const args of [{ action: 'edit', name: 'bug', description: 'x' }, { action: 'off', name: 'bug' }, { action: 'on', name: 'bug' }]) {
    expect(await call($, args)).toContain(".symcc/kinds/bug.md can't be read as a kind: no description")
    expect(mine['bug.md']).toBe(broken)
  }
  expect(await call($, { action: 'add', name: 'bug', description: 'x' })).toContain("is already there but can't be read")
  expect(touched).toEqual([])
  expect(await call($, { action: 'reset', name: 'bug' })).toContain('bug is the built-in kind again')
  leadQueue.splice(0)
  skippedKinds.clear()
})

test('kinds refuses a name that could reach outside the kinds folder, for every action', async () => {
  const { $, mine, touched } = setup({ 'chore.md': '---\ndescription: small upkeep\n---\n' })
  for (const bad of ['../x', 'a/b', '..', '.', '/etc/passwd', 'a b'])
    for (const action of ['list', 'add', 'edit', 'reset', 'remove', 'off', 'on']) expect(await call($, { action, name: bad, description: 'x' })).toContain('not a valid kind name')
  expect(await call($, { action: 'edit' })).toContain('say which kind to edit')
  expect(touched).toEqual([])
  expect(Object.keys(mine)).toEqual(['chore.md'])
})

test("the lead's instructions and the help name the kinds tool and say not to write kind files by hand", () => {
  expect(leadGuide()).toContain('Manage task kinds with symcc kinds, never by writing .symcc/kinds/ files by hand')
  expect(leadGuide()).toContain('Only change kinds when the owner asks')
  expect(manual('lead')).toContain('kinds does the same for the task kinds')
})
