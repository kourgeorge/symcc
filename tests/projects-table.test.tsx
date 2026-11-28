// T-1196: projects are a table of name -> repo path in board.json. repoOf reads it (a path anywhere on disk), an unknown
// name is refused, the one-time move writes <root>/<name> for repo folders below the board, and a board that is its own
// repo needs no table.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { change, load } from '../hooks/app/store'
import { runTool } from '../hooks/app/tools'
import { S } from '../hooks/app/state'
import { pump, waitIfBranchGone } from '../hooks/app/workers'
import { retryFileWaits } from '../hooks/app/watch'
import { taskBranchFacts, taskBranchesView } from '../hooks/app/branches'
import { mergedChanges, gitDiff } from '../hooks/app/changes'
import { projectNames, repoOf, projectGone, taskGitReady, projectNotes, openProjects } from '../hooks/app/git'
import { cleanupMerged } from '../hooks/app/worktree'
import { emptyBoard, find } from '../hooks/board'
import { DATA_VERSION } from '../hooks/core/board-file'
import { oldDataRows, upgradeBoard, withProjectPaths } from '../hooks/core/old-data'
import { fakeHost, memoryFs, done } from './fake-host'

const WISH = { why: 'asked', origin_by: 'owner', request: 'do it' }

/** A board folder /ws; `own` makes /ws a repo itself. */
async function world(own = false) {
  const files = new Map<string, string>()
  if (own) files.set('/ws/.git', '')
  const w = fakeHost({
    fs: { ...memoryFs(files), exists: async p => files.has(p) },
    run: async ([cmd, ...a]) => {
      const [x, y] = a.filter(v => !v.startsWith('-'))
      if (cmd === 'ln') return files.has(y!) ? done({ exitCode: 1 }) : (files.set(y!, files.get(x!)!), done())
      if (cmd === 'mv') return (files.set(y!, files.get(x!)!), files.delete(x!), done())
      if (cmd === 'git' && a.includes('rev-parse')) return done({ exitCode: 1 })
      if (cmd === 'rm') for (const f of a.filter(v => !v.startsWith('-'))) files.delete(f)
      return done()
    },
  })
  S.root = '/ws'
  S.writing = Promise.resolve()
  S.enabledNow = true
  await change(w.host, b => b)
  return { w, files }
}

test('repoOf gives the table path (anywhere on disk); an unknown name is refused and its task is not ready', async () => {
  const { w } = await world()
  S.projects = { api: '/elsewhere/api', client: '/ws/client' }
  expect(repoOf({ project: 'api' })).toBe('/elsewhere/api')
  expect(repoOf({ project: 'client' })).toBe('/ws/client')
  expect(repoOf({})).toBe('/ws')
  expect(() => repoOf({ project: 'web' })).toThrow('project table')
  expect(() => repoOf({ project: 'constructor' })).toThrow('project table')
  expect(projectGone({ project: 'web' })).toContain('not in this board')
  expect(projectGone({ project: 'api' })).toBe('')
  expect(await taskGitReady(w.host, emptyBoard(), { project: 'web' })).toBe(false)
  // a load reads the table from board.json (an entry with no path is no project)
  await change(w.host, b => ({ ...b, projects: { api: { path: '/elsewhere/api' }, old: { test_commands: ['x'] } } }))
  S.projects = {}
  await load(w.host)
  expect(S.projects).toEqual({ api: '/elsewhere/api' })
  expect(repoOf({ project: 'api' })).toBe('/elsewhere/api')
})

test('the one-time move writes <root>/<name> for repo folders below the board, and nothing for a board that is its own repo', () => {
  const raw = { version: 1, projects: { client: { test_commands: ['npm test'] }, server: { path: '/elsewhere/server' } } }
  const up = upgradeBoard(raw, '/ws/', ['client', 'server', 'web']) as { projects?: Record<string, unknown> }
  expect(up.projects).toEqual(raw.projects)
  const raw2 = { version: 1, projects: { client: { test_commands: ['npm test'] } } }
  const up2 = upgradeBoard(raw2, '/ws/', ['client', 'web']) as { projects: Record<string, unknown> }
  expect(up2.projects).toEqual({ client: { test_commands: ['npm test'], path: '/ws/client' }, web: { path: '/ws/web' } })
  // once only: a table that has a path already is not touched (a repo cloned later is no "old data")
  expect(withProjectPaths(raw.projects, '/ws', ['web'])).toBe(null)
  const input = (repoFolders: string[], board: object) => ({ board, archive: [], scouts: null, withRuns: new Set<string>(), fieldGuide: false, orgMem: false, repoFolders, root: '/ws' })
  expect(oldDataRows(input(['client'], { ...raw2, tasks: [{}] })).find(r => r.text.startsWith('project folders'))?.n).toBe(1)
  expect(oldDataRows(input(['server'], { ...raw, tasks: [{}] })).find(r => r.text.startsWith('project folders'))).toBe(undefined)
  // a fresh board (no tasks) is not old data
  expect(oldDataRows(input(['client'], { ...raw2, tasks: [] })).find(r => r.text.startsWith('project folders'))).toBe(undefined)
  // a board that is its own repo has no repo folders: nothing is written
  expect(upgradeBoard({ version: 1 }, '/ws', [])).toEqual({ data_version: DATA_VERSION })
  expect(oldDataRows(input([], { version: 1, tasks: [] })).find(r => r.text.startsWith('project folders'))).toBe(undefined)
})

test('a board that is its own repo: no table, a task with no project works in the board repo, nothing new is shown', async () => {
  const { w, files } = await world(true)
  S.projects = {}
  expect(projectNames()).toEqual([])
  expect(repoOf({})).toBe('/ws')
  expect(projectGone({})).toBe('')
  expect(await runTool(w.host, 'add', { ...WISH, title: 'Plain' })).toContain('added T-1')
  expect(repoOf(find(await load(w.host), 'T-1'))).toBe('/ws')
  expect((JSON.parse(files.get('/ws/.symcc/board.json')!) as { projects?: unknown }).projects).toBe(undefined)
  expect(projectNotes(openProjects(await load(w.host)))).toBe('')
})

test('a task with an unknown project can be moved to a valid one, and the pump skips it instead of throwing', async () => {
  const { w } = await world()
  S.projects = { client: '/ws/client' }
  await change(w.host, b => ({ ...b, projects: { client: { path: '/ws/client' } } }))
  await runTool(w.host, 'add', { ...WISH, title: 'Old', project: 'client' })
  await change(w.host, b => ({ ...b, tasks: b.tasks.map(t => ({ ...t, project: 'gone' })) }))
  expect(await runTool(w.host, 'change', { task: 'T-1', project: 'client', why: 'w' })).toContain('updated')
  expect(find(await load(w.host), 'T-1')?.project).toBe('client')
  await change(w.host, b => ({ ...b, tasks: b.tasks.map(t => ({ ...t, project: 'gone' })) }))
  await pump(w.host)
})
