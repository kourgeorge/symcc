// T-1199: the lead adds, changes and removes projects (settings with project + path / remove). Each add check refuses with a
// plain reason; an add stores the repo's real path; change and remove are refused while open tasks use the project; the
// Settings value lists name -> path with test commands; the Live tab's Branches section draws one block per repo.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { change, load } from '../hooks/app/store'
import { saveSettings } from '../hooks/app/tools'
import { addProject } from '../hooks/app/projects'
import { readBranches } from '../hooks/app/branches'
import { S, leadQueue, scoutState } from '../hooks/app/state'
import { loadScouts, scheduleScouts } from '../hooks/app/scouts'
import { addTask, emptyBoard, settingWithProjects } from '../hooks/board'
import { liveBranchBlocks, segText, LIVE_INDENT } from '../hooks/core/live'
import { fakeHost, memoryFs, done } from './fake-host'
import { T0 } from './board-fixture'
import { branchFactsAt, branchTasks, sha } from './branches-fixture'

/** Fake git: `repos` maps a path to what `git rev-parse --show-toplevel --show-prefix` and `rev-parse HEAD` say. */
async function world(repos: Record<string, { top: string; prefix?: string; commits?: boolean }>, extra: string[] = []) {
  const files = new Map<string, string>(extra.map(f => [f, '']))
  for (const p of Object.keys(repos)) files.set(p, '')
  const w = fakeHost({
    fs: { ...memoryFs(files), exists: async p => files.has(p) },
    run: async ([cmd, ...a], o) => {
      const [x, y] = a.filter(v => !v.startsWith('-'))
      if (cmd === 'ln') return files.has(y!) ? done({ exitCode: 1 }) : (files.set(y!, files.get(x!)!), done())
      if (cmd === 'mv') return (files.set(y!, files.get(x!)!), files.delete(x!), done())
      if (cmd === 'rm') for (const f of a.filter(v => !v.startsWith('-'))) files.delete(f)
      if (cmd === 'git' && a[0] === 'rev-parse') {
        if (a.some(x => x.startsWith('refs/heads/'))) return done({ exitCode: 1 })
        const r = repos[o?.cwd ?? '']
        if (!r) return done({ exitCode: 128, stderr: 'not a git repository' })
        if (a.includes('--show-toplevel')) return done({ stdout: `${r.top}\n${r.prefix ?? ''}\n` })
        return r.commits === false ? done({ exitCode: 1 }) : done({ stdout: 'abc\n' })
      }
      if (cmd === 'git' && (a[0] === 'show-ref' || a.includes('--verify'))) return done({ exitCode: 1 })
      return done()
    },
  })
  S.root = '/ws'
  S.home = '/home/me'
  S.writing = Promise.resolve()
  S.enabledNow = true
  S.projects = {}
  await change(w.host, b => b)
  return { w, files }
}
const set = (w: Awaited<ReturnType<typeof world>>['w'], a: Record<string, unknown>) => saveSettings(w.host, a, 'the lead')

test('each add check refuses with a plain reason; a good add stores the real path', async () => {
  const { w } = await world(
    {
      '/code/api': { top: '/real/api' },
      '/code/api/src': { top: '/real/api', prefix: 'src/' },
      '/code/empty': { top: '/code/empty', commits: false },
      '/code/own': { top: '/code/own' },
      '/code/.symcc/x': { top: '/code/.symcc/x' },
      '/home/me/web': { top: '/real/web' },
      '/real/api': { top: '/real/api' },
      '/real/web': { top: '/real/web' },
    },
    ['/code/own/.symcc/board.json', '/code/notrepo'],
  )
  const err = async (a: Record<string, unknown>) => (await set(w, a)).error ?? ''
  expect(await err({ project: 'api', path: 'code/api' })).toContain('full path')
  expect(await err({ project: 'api', path: '/nowhere' })).toContain('does not exist')
  expect(await err({ project: 'api', path: '/code/notrepo' })).toContain('not a git repo')
  expect(await err({ project: 'api', path: '/code/api/src' })).toContain("not the repo's top folder")
  expect(await err({ project: 'api', path: '/code/empty' })).toContain('no commits')
  expect(await err({ project: 'api', path: '/code/own' })).toContain('board of its own')
  expect(await err({ project: 'api', path: '/code/.symcc/x' })).toContain('inside a .symcc folder')
  expect(await err({ project: 'a/b', path: '/code/api' })).toContain('not a project name')
  expect(await err({ project: 'api', path: '/code/api', test_commands: ['x'] })).toContain('no other setting')
  expect((await load(w.host)).projects).toBe(undefined)
  const ok = await set(w, { project: 'api', path: '/code/api/' })
  expect(ok.error).toBe(undefined)
  expect((await load(w.host)).projects).toEqual({ api: { path: '/real/api' } })
  expect(S.projects).toEqual({ api: '/real/api' })
  // the name is taken; the same repo can't be two projects; ~ is the home folder
  expect(await err({ project: 'api', path: '/code/api' })).toBe('')
  expect('error' in (await addProject(w.host, 'api', '/code/api'))).toBe(true)
  expect(await err({ project: 'api2', path: '/code/api' })).toContain("already the project 'api'")
  expect((await set(w, { project: 'web', path: '~/web' })).error).toBe(undefined)
  expect(S.projects.web).toBe('/real/web')
})

test('change and remove are refused while open tasks use the project; they work once none does', async () => {
  const { w, files } = await world({ '/code/api': { top: '/code/api' }, '/code/api2': { top: '/code/api2' } })
  await set(w, { project: 'api', path: '/code/api' })
  await change(w.host, b => {
    const [y, t] = addTask(b, { origin: { why: 'a test' }, title: 'Work', details: 'x', files: ['a'] }, new Date().toISOString())
    return [{ ...y, tasks: y.tasks.map(x => (x.id === t.id ? { ...x, project: 'api' } : x)) }, t]
  })
  const moved = await set(w, { project: 'api', path: '/code/api2' })
  expect(moved.error).toBe(undefined)
  expect(S.projects.api).toBe('/code/api2')
  // a copy for the open task: a path change is refused
  S.root = '/ws'
  const id = (await load(w.host)).tasks[0]!.id
  files.set(`/ws/.symcc/worktrees/${id}/.git`, '')
  const refused = await set(w, { project: 'api', path: '/code/api' })
  expect(refused.error ?? '').toContain('already has a copy')
  const rm = await set(w, { project: 'api', remove: true })
  expect(rm.error ?? '').toContain(`${id} still uses project api`)
  await change(w.host, b => ({ ...b, tasks: b.tasks.map(t => ({ ...t, status: 'dropped' as const })) }))
  expect((await set(w, { project: 'api', remove: true })).error).toBe(undefined)
  expect((await load(w.host)).projects).toBe(undefined)
  expect((await set(w, { project: 'api', remove: true })).error).toContain('not a project')
})

// T-1214: a scout naming an unknown project gets a warning and the lead hears once; removing a project a scout names is refused
test('a scout naming an unknown project warns and tells the lead once; remove is refused while a scout names the project', async () => {
  const { w, files } = await world({ '/code/api': { top: '/code/api' } })
  await set(w, { project: 'api', path: '/code/api' })
  const file = `${S.root}/${S.N.scouts}/bugs.md`
  files.set(file, '---\nevery_minutes: 30\nprojects: api, nope\n---\nLook.\n')
  files.set(`${S.root}/${S.N.scouts}`, '')
  w.host.fs.list = async () => [...files.keys()].filter(f => f.startsWith(`${S.root}/${S.N.scouts}/`)).map(f => ({ name: f.split('/').pop()!, kind: 'file' as const, size: 0, mtimeMs: 0, isLink: false }))
  leadQueue.splice(0)
  const first = await loadScouts(w.host)
  expect(first[0]!.warning).toContain('unknown project "nope"')
  await loadScouts(w.host)
  expect(leadQueue.filter(t => t.includes('bugs')).length).toBe(1)
  files.set(file, '---\nevery_minutes: 30\nprojects: api\n---\nLook.\n')
  const refused = await set(w, { project: 'api', remove: true })
  expect(refused.error ?? '').toContain('scout bugs still names project api')
  files.set(file, '---\nevery_minutes: 30\n---\nLook.\n')
  expect((await set(w, { project: 'api', remove: true })).error).toBe(undefined)
})

// T-1216: adding the missing project clears the scout's warning at once; an unrelated project doesn't tell the lead again
test('adding the missing project clears the scout warning; another project does not tell the lead again', async () => {
  const { w, files } = await world({ '/code/api': { top: '/code/api' }, '/code/web': { top: '/code/web' }, '/code/nope': { top: '/code/nope' } })
  await set(w, { project: 'api', path: '/code/api' })
  files.set(`${S.root}/${S.N.scouts}/docs.md`, '---\nevery_minutes: 30\nprojects: api, nope\n---\nLook.\n')
  files.set(`${S.root}/${S.N.scouts}`, '')
  w.host.fs.list = async () => [...files.keys()].filter(f => f.startsWith(`${S.root}/${S.N.scouts}/`)).map(f => ({ name: f.split('/').pop()!, kind: 'file' as const, size: 0, mtimeMs: 0, isLink: false }))
  leadQueue.splice(0)
  await scheduleScouts(w.host)
  expect(scoutState.get('docs')?.warning ?? '').toContain('unknown project "nope"')
  const told = () => leadQueue.filter(t => t.includes('docs')).length
  expect(told()).toBe(1)
  await set(w, { project: 'web', path: '/code/web' })
  expect(told()).toBe(1)
  await set(w, { project: 'nope', path: '/code/nope' })
  expect(scoutState.get('docs')?.warning ?? '').not.toContain('unknown project')
})

test('the Settings value lists each project as name -> path with its test commands', () => {
  const b = { ...emptyBoard(), test_commands: ['npm test'], projects: { api: { path: '/code/api', test_commands: ['pytest'] }, web: { path: '/code/web' } } }
  expect(settingWithProjects(b, 'test_commands')).toBe('npm test · api → /code/api: pytest · web → /code/web')
})

test('the Branches section draws one block per repo, each task hanging off its own repo line; one repo is as before', () => {
  const tasks = branchTasks(T0) as { id: string; project?: string }[]
  const facts = branchFactsAt(T0)
  const one = { tasks: tasks as never[], branches: facts }
  const before = liveBranchBlocks(one, T0, 100)
  expect(before.length).toBe(1)
  expect(before[0]!.repoHead).toBe(undefined)
  // two repos: T-721 and T-724 in client, T-725 and T-726 in server
  const proj = (id: string) => (id === 'T-721' || id === 'T-724' ? 'client' : 'server')
  const withProject = tasks.map(t => ({ ...t, project: proj(t.id) }))
  const repo = (project: string, into: string, ids: string[]) => ({ project, name: project, into, commits: facts.commits, tasks: Object.fromEntries(ids.filter(i => facts.tasks[i]).map(i => [i, facts.tasks[i]!])) })
  const two = { tasks: withProject as never[], branches: { ...facts, repos: [repo('client', 'dev', ['T-721']), repo('server', 'main', ['T-725'])] } }
  const blocks = liveBranchBlocks(two, T0, 100)
  expect(blocks.map(b => segText(b.repoHead!).trim())).toEqual(['client · merges into dev', 'server · merges into main'])
  expect(blocks[0]!.rows.map(r => r.id)).toEqual(['T-724', 'T-721'])
  expect(blocks[1]!.rows.map(r => r.id)).toEqual(['T-725', 'T-726'])
  expect(blocks.every(b => segText(b.main).trim().length > 0)).toBe(true)
  void LIVE_INDENT
  void sha
})

test('readBranches: a repo block reads its open tasks branch, not an old done task one', async () => {
  const w = fakeHost({
    run: async ([cmd, ...a], o) => {
      if (cmd !== 'git') return done()
      const branches = o?.cwd === '/r/client' ? ['dev'] : ['main']
      if (a[0] === 'log') return branches.includes(a.find(x => x === 'dev' || x === 'main' || x === 'old-feature') ?? '') ? done({ stdout: `${sha('c1')} 1700000000\n` }) : done({ exitCode: 128 })
      if (a[0] === 'rev-list') return done({ stdout: '0\t1\n' })
      if (a[0] === 'merge-base') return done({ stdout: `${sha('c1')}\n` })
      return done()
    },
  })
  S.root = '/ws'
  S.projects = { client: '/r/client', server: '/r/server' }
  const t = (id: string, project: string, into: string, x: Record<string, unknown> = {}) => ({ id, title: id, status: 'doing', branch: `symcc/${id}`, project, merge_into: into, timeline: [], ...x })
  const tasks = [t('T-1', 'client', 'old-feature', { status: 'done', branch: null }), t('T-3', 'client', 'dev'), t('T-4', 'server', 'main')]
  const f = await readBranches(w.host, 'main', { tasks: tasks as never[] }, Date.now())
  expect(f?.repos?.map(r => `${r.project}:${r.into}`)).toEqual(['client:dev', 'server:main'])
})

test('T-1212: a project with test commands but no path can be given a path', async () => {
  const { w } = await world({ '/code/api': { top: '/real/api' }, '/real/api': { top: '/real/api' } })
  await change(w.host, b => ({ ...b, projects: { api: { test_commands: ['pytest'] } } }) as never)
  const r = await set(w, { project: 'api', path: '/code/api' })
  expect(r.error).toBe(undefined)
  expect((await load(w.host)).projects).toEqual({ api: { test_commands: ['pytest'], path: '/real/api' } })
  expect(S.projects.api).toBe('/real/api')
})
