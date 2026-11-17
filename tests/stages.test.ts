// Kind workflows step 2 (T-332): a kind file's body is read as its stage list (hooks/core/stages.ts).
// Step 3 (T-334): nextStage says what comes after a stage (tests at the end of this file).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { parseKind, kindSkipReason, kindFileText } from '../hooks/board'
import { parseStages, defaultStages, readKindRun, type Stage, nextStage, workerStageFor, retryStage, migratedStage, manyWorkers, workerAfter, retriedStage, rejectedStage } from '../hooks/core/stages'
import { S } from '../hooks/plugin/state'
import { loadKinds } from '../hooks/plugin/kinds'
import { BUILT_IN_KIND_TEXTS } from '../kinds'

// The real built-in kind texts (kinds/<name>.ts).
const BUILT_IN = BUILT_IN_KIND_TEXTS

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
  const mine: Record<string, string> = { 'bug.md': '---\ndescription: mine\n---\n## fix\nworker: task\n\n## tests\ncheck: tests\non fail: back to code, 2 times\n' }
  const dirOf = (p: string) => (p.startsWith(MINE) ? [mine, p.slice(MINE.length + 1)] : null) as [Record<string, string>, string] | null
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

// ---------------- what comes after a stage (T-334) ----------------

/** A kind of two worker stages: code, a tests check, review (another worker), a tests check that goes back to code once, then merge. */
const PAIR = parseStages('## code\nworker: task\nDo it.\n\n## check\ncheck: tests\non fail: back to code, 2 times\n\n## review\nworker: tester\nLook again.\n\n## again\ncheck: tests\non fail: back to code, 1 time\n', 'pair') as Stage[]

test('nextStage: a stage that passed goes on to the next one, and the last written stage to the merge step', () => {
  const next = (stage?: string) => {
    const n = nextStage(PAIR, { stage }, 'passed')
    return n.go === 'next' ? n.stage.name : n.go
  }
  expect(next('code')).toBe('check')
  expect(next('check')).toBe('review')
  expect(next('again')).toBe('merge')
  // no stage yet: the first one
  expect(next(undefined)).toBe('check')
  // a kind that doesn't merge ends after its last stage
  const answer = parseStages('## research\nworker: task\n', 'answer', false) as Stage[]
  expect(nextStage(answer, { stage: 'research' }, 'passed')).toEqual({ go: 'end' })
})

test('nextStage: a failed check goes back to its on fail stage, counting the go-backs; used up, the task fails', () => {
  const n1 = nextStage(PAIR, { stage: 'check' }, 'failed')
  expect(n1.go === 'back' && [n1.stage.name, n1.count, n1.times]).toEqual(['code', 1, 2])
  const n2 = nextStage(PAIR, { stage: 'check', backs: { check: 1 } }, 'failed')
  expect(n2.go === 'back' && [n2.stage.name, n2.count, n2.times]).toEqual(['code', 2, 2])
  expect(nextStage(PAIR, { stage: 'check', backs: { check: 2 } }, 'failed')).toEqual({ go: 'failed', why: 'stage check still failed after going back to code 2 times' })
  // each stage counts its own go-backs
  const n3 = nextStage(PAIR, { stage: 'again', backs: { check: 2 } }, 'failed')
  expect(n3.go === 'back' && [n3.stage.name, n3.count, n3.times]).toEqual(['code', 1, 1])
  expect(nextStage(PAIR, { stage: 'again', backs: { again: 1 } }, 'failed').go).toBe('failed')
})

test('nextStage: a failed worker stage fails at once; a check with no on fail goes back to the worker before it, auto_retries times', () => {
  expect(nextStage(PAIR, { stage: 'review' }, 'failed')).toEqual({ go: 'failed', why: 'stage review failed' })
  const plain = parseStages('## code\nworker: task\n\n## lint\ncheck: run: npm run lint\n', 'plain') as Stage[]
  const n = nextStage(plain, { stage: 'lint' }, 'failed', 2)
  expect(n.go === 'back' && [n.stage.name, n.count, n.times]).toEqual(['code', 1, 2])
  expect(nextStage(plain, { stage: 'lint', backs: { lint: 2 } }, 'failed', 2).go).toBe('failed')
  expect(nextStage(plain, { stage: 'lint' }, 'failed', 0).go).toBe('failed')
})

test('the worker stage a task runs, where a merge-step failure goes back to, and the stage a task is migrated to', () => {
  expect(workerStageFor(PAIR, 'check')!.name).toBe('code')
  expect(workerStageFor(PAIR, 'again')!.name).toBe('review')
  expect(workerStageFor(PAIR, undefined)!.name).toBe('code')
  expect(workerStageFor(PAIR, 'gone')!.name).toBe('code')
  expect([manyWorkers(PAIR), workerAfter(PAIR, 'code'), workerAfter(PAIR, 'review')]).toEqual([true, true, false])
  // the tests after the last worker go back to code; a conflict goes to the last worker stage
  expect([retryStage(PAIR)!.name, retryStage(PAIR, true)!.name]).toEqual(['code', 'review'])
  const change = parseKind('change', BUILT_IN.change!)!.stages
  expect(manyWorkers(change)).toBe(false)
  expect([migratedStage(change, 'todo'), migratedStage(change, 'doing'), migratedStage(change, 'review'), migratedStage(change, 'done')]).toEqual(['code', 'code', 'tests', undefined])
  expect(migratedStage(parseKind('investigation', BUILT_IN.investigation!)!.stages, 'review')).toBe('read')
})

test('T-340: a retried task restarts at the worker stage it was in; a rejected one at the last worker stage before the merge step', () => {
  expect([retriedStage(PAIR, 'code'), retriedStage(PAIR, 'check'), retriedStage(PAIR, 'again'), retriedStage(PAIR, undefined)]).toEqual(['code', 'code', 'review', 'code'])
  expect(rejectedStage(PAIR)).toBe('review')
  const change = parseKind('change', BUILT_IN.change!)!.stages
  expect([retriedStage(change, 'tests'), rejectedStage(change)]).toEqual(['code', 'code'])
  // with its go-backs cleared, a check that had used them all goes back again
  expect(nextStage(PAIR, { stage: 'check', backs: { check: 2 } }, 'failed').go).toBe('failed')
  expect(nextStage(PAIR, { stage: 'check' }, 'failed').go).toBe('back')
})
