// Task types (T-328): built-in kind texts in the plugin's kinds/ (kinds/index.ts), the owner's own in .symcc/kinds/ over them.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { parseKind, kindSkipReason, mergeKinds, checkKind, kindNames, kindsLeadText, BUILT_IN_KINDS, detailRows, addTask, emptyBoard } from '../hooks/board'
import { taskStateGroups } from '../hooks/core/page-header'
import { S, skippedKinds } from '../hooks/app/state'
import { loadKinds } from '../hooks/app/kinds'
import { leadGuide } from '../hooks/app/tools'
import { BUILT_IN_KIND_TEXTS } from '../kinds'
import { ALL_FEATURES } from '../hooks/host'

const ROOT = '/proj'
const MINE = `${ROOT}/.symcc/kinds`
const PLUGIN = '/plugin'
const kindFile = (description: string) => `---\ndescription: ${description}\n---\n`

/** A fake $ with the project's .symcc/kinds (`mine`: file name -> text); the built-in task types are the real ones. */
function setup(mine: Record<string, string> = {}) {
  const toasts: string[] = []
  const where = (p: string): [Record<string, string>, string] | null => {
    if (p === MINE) return [mine, '']
    if (p.startsWith(`${MINE}/`)) return [mine, p.slice(MINE.length + 1)]
    return null
  }
  const $ = {
    features: ALL_FEATURES,
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
    },
    ui: { invalidate: () => undefined, toast: (t: string) => void toasts.push(t), log: () => undefined, status: () => undefined },
    clock: { after: () => undefined },
  }
  S.root = ROOT
  S.kinds = []
  return { $, toasts }
}

test('the built-in task types load from kinds/index.ts, change first; each built-in name has a text', async () => {
  const { $ } = setup()
  const kinds = await loadKinds($ as never)
  expect(kinds.map(k => k.name)).toEqual([...BUILT_IN_KINDS])
  expect(Object.keys(BUILT_IN_KIND_TEXTS).sort()).toEqual([...BUILT_IN_KINDS].sort())
  for (const k of kinds) expect(kindSkipReason(k.name, BUILT_IN_KIND_TEXTS[k.name]!)).toBeNull()
  expect(kinds.find(k => k.name === 'bug')!.description).toBe('something that works wrongly')
  expect(S.kinds).toBe(kinds)
})

test("the owner's .symcc/kinds/<name>.md wins over a built-in task type of the same name, and adds a new one", async () => {
  const { $ } = setup({ 'bug.md': '---\ndescription: a defect the owner found\n---\nSteps go here.\n', 'chore.md': kindFile('small upkeep') })
  const kinds = await loadKinds($ as never)
  expect(kinds.find(k => k.name === 'bug')).toMatchObject({ name: 'bug', description: 'a defect the owner found', body: 'Steps go here.' })
  expect(kinds.filter(k => k.name === 'bug').length).toBe(1)
  expect(kinds.map(k => k.name)).toEqual([...BUILT_IN_KINDS, 'chore'])
  expect(checkKind(kinds, 'chore')).toBe('chore')
})

test("an owner's kind file that can't be read is skipped with a note, and the built-in one is used", async () => {
  const { $, toasts } = setup({ 'bug.md': 'no front matter here' })
  const kinds = await loadKinds($ as never)
  expect(kinds.find(k => k.name === 'bug')!.description).toBe('something that works wrongly')
  expect(toasts.join('\n')).toContain('skipped .symcc/kinds/bug.md: no front matter')
  expect(skippedKinds.has('.symcc/kinds/bug.md')).toBe(true)
  // said once
  await loadKinds($ as never)
  expect(toasts.length).toBe(1)
})

test('a kind file needs a description and a plain name', () => {
  expect(parseKind('Bug', kindFile('wrong'))).toMatchObject({ name: 'bug', description: 'wrong', body: '' })
  expect(kindSkipReason('bug', '---\nmodel: x\n---\n')).toBe('no description')
  expect(kindSkipReason('a b', kindFile('x'))).toMatch(/^bad name/)
})

test('an unknown task type is refused naming the known ones; change and investigation are always known', () => {
  const kinds = mergeKinds([parseKind('bug', kindFile('wrong'))!], [])
  expect(kindNames(kinds)).toEqual(['change', 'bug', 'investigation'])
  expect(checkKind([], 'investigation')).toBe('investigation')
  expect(checkKind(kinds, ' BUG ')).toBe('bug')
  expect(() => checkKind(kinds, 'chore')).toThrow('unknown task type "chore"; the task types are: change, bug, investigation')
})

test("the lead's instructions list the kinds with their descriptions and say change when unsure", async () => {
  const { $ } = setup()
  await loadKinds($ as never)
  const text = kindsLeadText(S.kinds)
  expect(text).toContain('bug (something that works wrongly)')
  expect(text).toContain('change when unsure')
  expect(leadGuide()).toContain('refactor (cleaning up code without changing what it does)')
})

test('the task page shows the kind next to the role; a plain change shows no kind row', async () => {
  const { $ } = setup()
  await loadKinds($ as never)
  const [b, t] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Fix', kind: 'bug', role: 'tester' }, '2026-01-01T00:00:00.000Z')
  const rows = detailRows(t, { roles: [], kinds: S.kinds, all: b.tasks, when: s => s, nowMs: 0 })
  const roleAt = rows.findIndex(r => r.label === 'Role')
  expect(rows[roleAt + 1]!.label).toBe('Type')
  expect(rows[roleAt + 1]!.segs.map(s => s.text).join('')).toBe('bug — something that works wrongly')
  const [, c] = addTask(b, { origin: { why: 'a test' }, title: 'Plain' }, '2026-01-01T00:00:00.000Z')
  expect(detailRows(c, { roles: [], kinds: S.kinds, all: [c], when: s => s, nowMs: 0 }).some(r => r.label === 'Type')).toBe(false)
})

test('the state line of an answered investigation says "answered: read it" in green; a change task in review still says ready for review (T-701, T-751)', () => {
  const [b, inv] = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Why slow', kind: 'investigation' }, '2026-01-01T00:00:00.000Z')
  const [, ch] = addTask(b, { origin: { why: 'a test' }, title: 'Plain' }, '2026-01-01T00:00:00.000Z')
  const status = (t: typeof inv) => taskStateGroups({ ...t, status: 'review' }, { nowMs: 0 })[0]![0]!
  expect(status(inv)).toEqual({ text: '◆ answered: read it', color: 'success', bold: true })
  expect(status(ch)).toEqual({ text: '◆ ready for review', color: 'warning', bold: true })
})
