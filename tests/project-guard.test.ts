// T-1198: the path guards protect every project's repo path from the board's project table (a repo anywhere on disk,
// T-1196), not only the board folder: a worker's, checker's or scout's edit there, and a worker's shell command naming
// it, are refused; the worker's own copy stays allowed, and a board with no outside projects works as before.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { checkEdit, guardedRoots } from '../hooks/app/ask'
import { outsideFolderText, bashOutsideText, scoutEditText } from '../hooks/board'
import { S, scoutRuns, workers, checkerRuns } from '../hooks/app/state'
import { fakeHost } from './fake-host'

const ROOT = '/ws'
const WT = `${ROOT}/.symcc/worktrees/T-1`
const OUT = '/tmp/outside-api'

function setup(projects: Record<string, string> = { api: OUT }) {
  S.root = ROOT
  S.projects = projects
  workers.set('w1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
  checkerRuns.set('c1', { task: 'T-1', worktree: WT, end: () => undefined })
  scoutRuns.set('s1', 'gaps-bot')
  return fakeHost().host
}

test("a worker's and a checker's edit of an outside project's file is refused", async () => {
  const $ = setup()
  for (const id of ['w1', 'c1']) {
    expect(await checkEdit($, id, { path: `${OUT}/README.md` })).toBe(outsideFolderText('README.md', WT, S.N.dir))
    expect(await checkEdit($, id, { path: `/private${OUT}/src/a.ts` })).toBe(outsideFolderText('src/a.ts', WT, S.N.dir))
    expect(await checkEdit($, id, { path: OUT })).toBe(outsideFolderText('', WT, S.N.dir))
  }
})

test("a worker's shell command naming an outside project is refused, even to read", async () => {
  const $ = setup()
  for (const command of [`cat ${OUT}/README.md`, `echo x > ${OUT}/README.md`, `cd ${OUT} && ls`, `rm -rf /private${OUT}`])
    for (const id of ['w1', 'c1']) expect(await checkEdit($, id, { command }, WT)).toBe(bashOutsideText(command.startsWith('cd') || command.startsWith('rm') ? '' : 'README.md', WT))
})

test("a scout's edit of an outside project's file is refused; /tmp elsewhere stays free", async () => {
  const $ = setup()
  expect(await checkEdit($, 's1', { path: `${OUT}/README.md` })).toBe(scoutEditText('README.md'))
  expect(await checkEdit($, 's1', { path: `${OUT.toUpperCase()}/x` })).toBe(scoutEditText('x'))
  expect(await checkEdit($, 's1', { path: '/tmp/probe.ts' })).toBeUndefined()
  expect(await checkEdit($, 's1', { path: '/tmp/outside-api2/x' })).toBeUndefined()
})

test("the worker's own copy and other /tmp paths stay allowed with an outside project", async () => {
  const $ = setup()
  expect(await checkEdit($, 'w1', { path: `${WT}/README.md` })).toBeUndefined()
  expect(await checkEdit($, 'w1', { path: 'src/a.ts' })).toBeUndefined()
  expect(await checkEdit($, 'w1', { path: '/tmp/probe.ts' })).toBeUndefined()
  expect(await checkEdit($, 'w1', { command: `cat ${WT}/README.md && echo x > /tmp/probe` }, WT)).toBeUndefined()
})

test('a board with no outside projects guards only its own folder, as before', async () => {
  const $ = setup({})
  expect(guardedRoots()).toEqual([ROOT])
  expect(await checkEdit($, 'w1', { path: `${OUT}/README.md` })).toBeUndefined()
  expect(await checkEdit($, 'w1', { command: `cat ${OUT}/README.md` }, WT)).toBeUndefined()
  expect(await checkEdit($, 's1', { path: `${OUT}/README.md` })).toBeUndefined()
  expect(await checkEdit($, 'w1', { path: `${ROOT}/README.md` })).toBe(outsideFolderText('README.md', WT, S.N.dir))
  expect(await checkEdit($, 's1', { path: `${ROOT}/README.md` })).toBe(scoutEditText('README.md'))
})

test('guardedRoots: the board first, each project path once, never a relative path or / itself', () => {
  setup({ a: OUT, b: '/ws/client', c: 'rel/path', d: '/', e: OUT })
  expect(guardedRoots()).toEqual([ROOT, OUT, '/ws/client'])
})
