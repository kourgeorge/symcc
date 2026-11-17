// Kind workflows step 2 (T-332): a kind file's body is read as its stage list (hooks/core/stages.ts).
// Nothing runs the stages yet; these tests only check what is read.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { parseKind, kindSkipReason, kindFileText } from '../hooks/board'
import { parseStages, defaultStages, readKindRun, type Stage } from '../hooks/core/stages'
import { S } from '../hooks/plugin/state'
import { loadKinds } from '../hooks/plugin/kinds'

// The built-in kind files as they are in kinds/ (a test can only import code files, so they are copied here:
// keep these the same as kinds/*.md).
const work = (text: string) => `---\ndescription: DESC\n---\n## code\nworker: task\n${text}\n\n## tests\ncheck: tests\non fail: back to code, 2 times\n`
const BUILT_IN: Record<string, string> = {
  change: work('The worker changes files, which are committed, tested and merged.').replace('DESC', 'a general change when no other kind fits (the default)'),
  bug: work('The worker finds why it goes wrong and fixes it, with a test that fails before the fix and passes after.').replace('DESC', 'something that works wrongly'),
  feature: work('The worker adds the new behavior, with tests that show it works.').replace('DESC', 'new behavior for the owner'),
  refactor: work('The worker changes how the code is written, not what it does; the tests that pass before still pass after.').replace('DESC', 'cleaning up code without changing what it does'),
  docs: work('The worker changes documentation only (README, docs/, comments), not code.').replace('DESC', 'documentation only'),
  investigation:
    '---\ndescription: find an answer and hand it back; nothing is merged\nmerges: no\n---\n## research\nworker: task\nThe worker finds the answer and hands it back in full; nothing is committed, tested or merged.\n\n## read\ngate: owner\n',
}

const shape = (stages: Stage[]) => stages.map(s => `${s.name}=${s.type}${s.value ? `:${s.value}` : ''}${s.onFail ? ` (back to ${s.onFail.back} x${s.onFail.times})` : ''}`)

test('every built-in kind parses into one worker stage, a tests check and the merge step; investigation does not merge', () => {
  for (const name of ['change', 'bug', 'feature', 'refactor', 'docs']) {
    const k = parseKind(name, BUILT_IN[name]!)
    expect(k).not.toBeNull()
    expect(shape(k!.stages)).toEqual(['code=worker:task', 'tests=check:tests (back to code x2)', 'merge=merge'])
    expect(k!.stages[0]!.files).toBe('task')
    expect(k!.stages[0]!.text).toContain('The worker')
    expect(k!.merges).toBeUndefined()
  }
  const inv = parseKind('investigation', BUILT_IN.investigation!)!
  expect(inv.merges).toBe(false)
  expect(shape(inv.stages)).toEqual(['research=worker:task', 'read=gate:owner'])
})

test('the merge step is added only for merges: yes (the default), and a body with no stages gets one worker stage', () => {
  expect(parseStages('## code\nworker: task\n', 'x').map(s => s.name)).toEqual(['code', 'merge'])
  expect(parseStages('## code\nworker: task\n', 'x', false).map(s => s.name)).toEqual(['code'])
  expect(shape(parseKind('x', '---\ndescription: d\nmerges: yes\n---\n## code\nworker: task\n')!.stages)).toEqual(['code=worker:task', 'merge=merge'])
  expect(shape(parseKind('x', '---\ndescription: d\nmerges: no\n---\n## code\nworker: task\n')!.stages)).toEqual(['code=worker:task'])
  expect(shape(parseKind('x', '---\ndescription: d\n---\nJust do it.\n')!.stages)).toEqual(['code=worker:task', 'tests=check:tests (back to code x2)', 'merge=merge'])
  expect(parseKind('x', '---\ndescription: d\n---\nJust do it.\n')!.stages[0]!.text).toBe('Just do it.')
  expect(defaultStages(false).map(s => s.name)).toEqual(['code'])
  expect(readKindRun([{ key: 'merge_tests', value: 'no' }])).toEqual({ merges: true, mergeTests: false })
  expect(parseKind('docs', '---\ndescription: d\nmerge_tests: no\n---\n')!.mergeTests).toBe(false)
})

test('the optional keys are read: files, on fail, minutes, model; the free text after the keys is the stage text', () => {
  const body = '## reproduce\nworker: tester\nfiles: tests\nminutes: 5\nmodel: haiku\nWrite a test that shows the bug: it must fail.\n\n## fails-first\ncheck: new test fails on old code\non fail: back to reproduce, 1 time\n\n## run-lint\ncheck: run: npm run lint\n\n## ok\ngate: lead\n'
  const s = parseStages(body, 'bug') as Stage[]
  expect(shape(s)).toEqual(['reproduce=worker:tester', 'fails-first=check:new test fails on old code (back to reproduce x1)', 'run-lint=check:run: npm run lint', 'ok=gate:lead', 'merge=merge'])
  expect(s[0]).toMatchObject({ files: 'tests', minutes: 5, model: 'haiku', text: 'Write a test that shows the bug: it must fail.' })
  expect(parseStages('## spec\nworker: planner\nfiles: spec\n\n## build\nchildren: from spec\n', 'epic')).toHaveLength(3)
})

test('a kind file with an unknown key, a bad on fail target or children: outside epic is not used, with the reason', () => {
  const kind = (fm: string, body: string) => `---\ndescription: d\n${fm}---\n${body}`
  expect(kindSkipReason('x', kind('', '## code\nworker: task\ncolour: red\n'))).toBe('unknown key "colour" in stage "code" (use worker, check, gate, children, files, on fail, minutes, model)')
  expect(kindSkipReason('x', kind('speed: fast\n', '## code\nworker: task\n'))).toMatch(/^unknown key "speed" in the front matter/)
  expect(kindSkipReason('x', kind('', '## code\nworker: task\n\n## tests\ncheck: tests\non fail: back to cod, 2 times\n'))).toBe('on fail: in stage "tests" goes back to "cod", which is not a stage')
  expect(kindSkipReason('x', kind('', '## tests\ncheck: tests\non fail: back to code, 2 times\n\n## code\nworker: task\n'))).toBe('on fail: in stage "tests" goes back to "code", which is not an earlier stage')
  expect(kindSkipReason('x', kind('', '## code\nworker: task\n\n## tests\ncheck: tests\non fail: back to code\n'))).toMatch(/needs a count/)
  expect(kindSkipReason('feature', kind('', '## build\nchildren: from spec\n'))).toBe('stage "build" has children:, which only the epic kind may have')
  expect(kindSkipReason('x', kind('', '## code\nfiles: task\n'))).toMatch(/needs exactly one of worker:, check:, gate:, children:/)
  expect(kindSkipReason('x', kind('', '## code\nworker: task\ngate: owner\n'))).toMatch(/it has worker and gate/)
  expect(kindSkipReason('x', kind('', '## code\ncheck: lint\n'))).toMatch(/^unknown check "lint"/)
  expect(kindSkipReason('x', kind('', '## code\nworker: task\n\n## code\ncheck: tests\n'))).toBe('two stages are named "code"')
  expect(kindSkipReason('x', kind('', '## merge\nworker: task\n'))).toMatch(/can't be named "merge"/)
  expect(kindSkipReason('x', kind('merges: maybe\n', ''))).toBe('merges must be yes or no, not "maybe"')
})

test("the owner's kind file with a bad stage is skipped with a note, and the built-in kind is used", async () => {
  const PLUGIN = '/plugin'
  const MINE = '/proj/.symcc/kinds'
  const plugin: Record<string, string> = { 'bug.md': BUILT_IN.bug! }
  const mine: Record<string, string> = { 'bug.md': '---\ndescription: mine\n---\n## fix\nworker: task\n\n## tests\ncheck: tests\non fail: back to code, 2 times\n' }
  const dirOf = (p: string) => (p.startsWith(MINE) ? [mine, p.slice(MINE.length + 1)] : p.startsWith(`${PLUGIN}/kinds`) ? [plugin, p.slice(PLUGIN.length + 7)] : null) as [Record<string, string>, string] | null
  const toasts: string[] = []
  const $ = {
    plugin: { root: PLUGIN },
    fs: {
      exists: async (p: string) => !!dirOf(p),
      list: async (p: string) => Object.keys(dirOf(p)?.[0] ?? {}).map(name => ({ name, kind: 'file' })),
      read: async (p: string) => dirOf(p)![0][dirOf(p)![1]]!,
    },
    ui: { invalidate: () => undefined, toast: (t: string) => void toasts.push(t), log: () => undefined, status: () => undefined },
    clock: { after: () => undefined },
  }
  S.root = '/proj'
  const kinds = await loadKinds($ as never)
  expect(kinds.find(k => k.name === 'bug')!.description).toBe('something that works wrongly')
  expect(toasts.join('\n')).toContain('skipped .symcc/kinds/bug.md: on fail: in stage "tests" goes back to "code", which is not a stage')
})

test('a kind file written again keeps merges and merge_tests', () => {
  const text = kindFileText({ description: 'd', body: '## a\nworker: task', merges: false, mergeTests: false })
  expect(text).toBe('---\ndescription: d\nmerges: no\nmerge_tests: no\n---\n## a\nworker: task\n')
  expect(parseKind('x', text)).toMatchObject({ merges: false, mergeTests: false })
})
