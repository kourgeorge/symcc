// T-1137: projects. A task names its repo (a folder below the board folder that holds its own .git); the lead's add and
// change take `project` (a wrong name is refused with the folders that are projects); per-project test_commands are
// stored in board.json; rows and task pages show a small "[client]" tag; a board inside one repo has no projects.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { change, load } from '../hooks/app/store'
import { runTool } from '../hooks/app/tools'
import { S } from '../hooks/app/state'
import { projectNames, repoOf } from '../hooks/app/git'
import { rowTitle, readBoard, parseBoard, isProjectName, testCommandsOf, docsTestCommandsOf, mergeTestCount } from '../hooks/board'
import { chatTasksText } from '../hooks/core/chat-text'
import { tasksListText } from '../hooks/core/task-list'
import { fakeHost, memoryFs, done } from './fake-host'
import { PANE, BOARD_VIEW, BOARD_TASKS, seedBoard } from './board-fixture'

const WISH = { why: 'asked', origin_by: 'owner', request: 'do it' }

/** A board folder /ws; `repos` are the folders below it that hold a .git; `own` makes /ws a repo itself. */
async function world(repos: string[], own = false) {
  const files = new Map<string, string>()
  if (own) files.set('/ws/.git', '')
  for (const r of repos) files.set(`/ws/${r}/.git`, '')
  const w = fakeHost({
    fs: {
      ...memoryFs(files),
      exists: async p => files.has(p),
      list: async p => (p === '/ws' ? [...repos, 'notes', '.hidden'].map(name => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })) : []),
    },
    run: async ([cmd, ...a]) => {
      const [x, y] = a.filter(v => !v.startsWith('-'))
      if (cmd === 'ln') return files.has(y!) ? done({ exitCode: 1 }) : (files.set(y!, files.get(x!)!), done())
      if (cmd === 'mv') return (files.set(y!, files.get(x!)!), files.delete(x!), done())
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

const boardOf = (files: Map<string, string>) => JSON.parse(files.get('/ws/.symcc/board.json')!) as { tasks: { id: string; project?: string }[]; projects?: Record<string, { test_commands?: string[] }> }

test('add with a project stores it; a wrong name is refused with the project folders; change sets and clears it', async () => {
  const { w, files } = await world(['server', 'client'])
  expect(await projectNames(w.host)).toEqual(['client', 'server'])
  expect(await runTool(w.host, 'add', { ...WISH, title: 'Fix login', project: 'client' })).toContain('added T-1')
  expect(boardOf(files).tasks[0]!.project).toBe('client')
  const err = await runTool(w.host, 'add', { ...WISH, title: 'Nope', project: 'clinet' }).catch((e: Error) => e.message)
  expect(err).toContain('client')
  expect(err).toContain('server')
  expect(err).not.toContain('notes')
  expect(boardOf(files).tasks.length).toBe(1)
  // the board tool's task text shows it
  expect(await runTool(w.host, 'board', { task: 'T-1' })).toContain('project: client')
  expect(await runTool(w.host, 'change', { task: 'T-1', project: 'server' })).toContain('T-1')
  expect(boardOf(files).tasks[0]!.project).toBe('server')
  await runTool(w.host, 'change', { task: 'T-1', project: '' })
  expect(boardOf(files).tasks[0]!.project).toBe(undefined)
})

test('a board inside one repo has no projects: add without project works, and a project name is refused', async () => {
  const { w, files } = await world(['server'], true)
  expect(await projectNames(w.host)).toEqual([])
  expect(await runTool(w.host, 'add', { ...WISH, title: 'Plain' })).toContain('added T-1')
  expect(boardOf(files).tasks[0]!.project).toBe(undefined)
  expect(await runTool(w.host, 'add', { ...WISH, title: 'Other', project: 'server' }).catch((e: Error) => e.message)).toContain('no project folders')
})

test('per-project test_commands round-trip through board.json, only for a project folder', async () => {
  const { w, files } = await world(['server', 'client'])
  expect(await runTool(w.host, 'settings', { project: 'client', test_commands: ['npm test', 'npm run lint'] })).toContain('npm test')
  expect(boardOf(files).projects).toEqual({ client: { test_commands: ['npm test', 'npm run lint'] } })
  const read = readBoard(files.get('/ws/.symcc/board.json')!)
  expect(read.board.projects).toEqual({ client: { test_commands: ['npm test', 'npm run lint'] } })
  expect((await load(w.host)).projects?.client?.test_commands).toEqual(['npm test', 'npm run lint'])
  // the board's own test_commands are not touched
  expect((await load(w.host)).test_commands).toEqual([])
  expect(await runTool(w.host, 'settings', { project: 'nope', test_commands: ['x'] })).toContain('server')
  expect(await runTool(w.host, 'settings', { project: 'client', max_parallel: 2 })).toContain('only test_commands')
  await runTool(w.host, 'settings', { project: 'client', test_commands: [] })
  expect(boardOf(files).projects).toBe(undefined)
})

test('the chat list and chat page show the project tag; a task with none shows none', async () => {
  const tasks = [
    { ...BOARD_TASKS.find(t => t.id === 'T-406')!, title: 'Fix login', project: 'client' },
    { ...BOARD_TASKS.find(t => t.id === 'T-408')!, title: 'Plain one' },
  ]
  expect(rowTitle(tasks[0]!)).toBe('[client] Fix login')
  expect(rowTitle(tasks[1]!)).toBe('Plain one')
  const text = tasksListText({ ...(readBoard(null).board), tasks: tasks as never }, Date.parse('2026-11-18T12:00:00Z'))
  expect(text).toContain('[client] Fix login')
  expect(text).not.toContain('[client] Plain')
  expect(chatTasksText({ tasks: tasks as never }, Date.parse('2026-11-18T12:00:00Z'))).toContain('[client] Fix login')
})

for (const surface of ['terminal', 'vscode'] as const)
  test(`${surface}: a task row shows the project tag`, async ($, on) => {
    const tasks = BOARD_TASKS.map(t => (t.id === 'T-406' ? { ...t, title: 'Fix login', project: 'client' } : t))
    seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, tasks } }, tab: 'tasks' })
    const ui = await $.ui.mount({ ...PANE, surface, props: { ...PANE.props, bodyColumns: 100 } })
    expect(JSON.stringify(await ui.drawn())).toMatch(/\[client\\*\] Fix login/)
    await ui.unmount()
  })

test('T-1146: a change that sets only the project keeps a running or finished task as it is, and writes a history line', async () => {
  const { w, files } = await world(['server', 'client'])
  await runTool(w.host, 'add', { ...WISH, title: 'Fix login', project: 'client' })
  await runTool(w.host, 'add', { ...WISH, title: 'Other', project: 'client' })
  await change(w.host, b => ({ ...b, tasks: b.tasks.map(t => (t.id === 'T-1' ? { ...t, status: 'doing' as const } : { ...t, status: 'review' as const })) }))
  expect(await runTool(w.host, 'change', { task: 'T-1', project: 'server' })).toContain('keeps running')
  const doing = (await load(w.host)).tasks.find(t => t.id === 'T-1')!
  expect(doing.status).toBe('doing')
  expect(doing.history?.some(h => h.text.includes('project: server (was client)'))).toBe(true)
  expect(doing.history?.some(h => h.text.includes('restarted'))).toBe(false)
  await runTool(w.host, 'change', { task: 'T-2', project: 'server' })
  expect((await load(w.host)).tasks.find(t => t.id === 'T-2')!.status).toBe('review')
  expect(boardOf(files).tasks[1]!.project).toBe('server')
})

test('T-1146: settings with no input lists the per-project test_commands; a project that is not text is refused', async () => {
  const { w } = await world(['server', 'client'])
  await runTool(w.host, 'settings', { project: 'server', test_commands: ['make test'] })
  expect(await runTool(w.host, 'settings', {})).toContain('project server: test_commands')
  expect(await runTool(w.host, 'settings', { project: 5 })).toContain('Nothing changed')
})

test('T-1146: a running task in VS Code Live shows its tag', async ($, on) => {
  const tasks = BOARD_TASKS.map(t => (t.id === 'T-402' ? { ...t, title: 'Keep search open', project: 'client' } : t))
  seedBoard(on, { view: { ...BOARD_VIEW, value: { ...BOARD_VIEW.value, tasks } }, tab: 'live' })
  const ui = await $.ui.mount({ ...PANE, surface: 'vscode', props: { ...PANE.props, bodyColumns: 100 } })
  expect(JSON.stringify(await ui.drawn())).toMatch(/\[client\\*\] Keep search open/)
  await ui.unmount()
})

test('T-1153: a project that is not one plain folder name is dropped on load, and repoOf refuses it', async () => {
  const task = (id: string, project: unknown) => ({ id, title: id, status: 'todo', priority: 0, attempts: 0, branch: null, files: [], depends_on: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', project })
  const names = ['../evil', '/etc', 'a/b', '..', '.hidden', 'a\\b', ' client', 'client']
  const b = parseBoard(JSON.stringify({ version: 1, next_id: 9, mode: 'auto', test_commands: [], max_parallel: 1, max_minutes: 1, auto_retries: 0, open_on_start: true, tasks: names.map((p, i) => task(`T-${i + 1}`, p)) }))
  expect(b.tasks.map(t => (t as { project?: string }).project ?? null)).toEqual([null, null, null, null, null, null, null, 'client'])
  for (const p of ['client', 'my-app.v2', 'x_1']) expect(isProjectName(p)).toBe(true)
  for (const p of names.slice(0, 7)) expect(isProjectName(p)).toBe(false)
  S.root = '/ws'
  expect(repoOf({ project: 'client' })).toBe('/ws/client')
  expect(repoOf({})).toBe('/ws')
  let err = ''
  try {
    repoOf({ project: '../evil' })
  } catch (e) {
    err = (e as Error).message
  }
  expect(err).toContain('not a project folder name')
})

test("T-1153: a task of a project runs its own test commands (and docs ones) when set, else the board's", async () => {
  const b = { test_commands: ['npm test'], docs_test_commands: ['lint docs'], projects: { client: { test_commands: ['test -f ok'] }, docs: { docs_test_commands: ['vale .'] } } }
  expect(testCommandsOf(b, { project: 'client' })).toEqual(['test -f ok'])
  expect(testCommandsOf(b, { project: 'server' })).toEqual(['npm test'])
  expect(testCommandsOf(b, {})).toEqual(['npm test'])
  expect(testCommandsOf(b, { project: 'constructor' })).toEqual(['npm test'])
  expect(docsTestCommandsOf(b, { project: 'client' })).toEqual(['lint docs'])
  expect(docsTestCommandsOf(b, { project: 'docs' })).toEqual(['vale .'])
  expect(mergeTestCount({ ...b, test_commands: ['a', 'b', 'c'] }, { project: 'client' })).toBe(1)
  // boards with no projects work as before
  expect(testCommandsOf({ test_commands: ['x'] }, { project: 'client' })).toEqual(['x'])
})
