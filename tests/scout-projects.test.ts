// T-1200: scouts name their projects (front matter projects:), the scout prompt lists name: path, an unknown project is
// refused with a reason, and a worker's prompt for a project task says to read the repo's CLAUDE.md / AGENTS.md. A board
// with no projects gets the same prompts as before. T-1211: project reads are judged on a made-up disk (fake-disk.ts).
import { expect, test } from 'claude-code/testing'
import type { SymccScout, SymccTask } from '../types'
import { parseScout, scoutText, scoutPrompt, scoutProjectsError, scoutProjectTable, leadScoutText } from '../hooks/core/scouts'
import { fillPrompt } from '../hooks/core/prompts'
import { readInsideProjects } from '../hooks/claude/project-reads'
import { readAllowed } from '../hooks/app/ask'
import { S, scoutRuns } from '../hooks/app/state'
import type { Host } from '../hooks/host'
import { fakeDisk } from './fake-disk'

// a project repo with a link to the owner's ssh keys, a link inside the same repo, and a link to another project
const disk = fakeDisk({
  '/code': 'dir',
  '/code/api': 'dir',
  '/code/api/src': 'dir',
  '/code/api/CLAUDE.md': 'file',
  '/code/api/keys': '-> /home/me/.ssh',
  '/code/api/passwd': '-> /etc/passwd',
  '/code/api/docs': '-> src',
  '/code/api/web': '-> /code/web',
  '/code/api/nowhere': '-> /etc/new',
  '/code/web': 'dir',
  '/code/web/a': 'file',
  '/home': 'dir',
  '/home/me': 'dir',
  '/home/me/.ssh': 'dir',
  '/home/me/.ssh/id_rsa': 'file',
  '/etc': 'dir',
  '/etc/passwd': 'file',
  '/real': 'dir',
  '/real/lib': 'dir',
  '/real/lib/x': 'file',
  '/lib': '-> /real/lib',
})
const ok = (tool: string, input: unknown, roots: string[]) => readInsideProjects(tool, input, roots, disk)

/** A host whose disk is `disk` (only what readAllowed's lookups use). */
const diskHost = {
  fs: {
    stat: async (p: string) => {
      const realPath = await disk.real(p)
      if (realPath === undefined) throw new Error(`ENOENT ${p}`)
      return { kind: 'file', size: 0, mtimeMs: 0, isLink: false, realPath }
    },
    list: async (d: string) => disk.list(d).map(e => ({ ...e, kind: e.isLink ? 'other' : 'file', size: 0, mtimeMs: 0 })),
  },
} as unknown as Host

test('symcc answers allow only for a symcc scout reading inside a project path', async () => {
  S.root = '/board'
  S.projects = { api: '/code/api' }
  scoutRuns.set('s1', 'bugs')
  const allowed = (agent: string | undefined, tool: string, input: unknown) => readAllowed(diskHost, agent, (r, look) => readInsideProjects(tool, input, r, look))
  expect(await allowed('s1', 'Read', { file_path: '/code/api/CLAUDE.md' })).toBe(true)
  expect(await allowed('s1', 'Bash', { command: 'cat /code/api/AGENTS.md' })).toBe(true)
  expect(await allowed('s1', 'Bash', { command: 'ls /code/api/src' })).toBe(true)
  expect(await allowed('s1', 'Read', { file_path: '/etc/passwd' })).toBe(false)
  expect(await allowed('s1', 'Edit', { file_path: '/code/api/a' })).toBe(false)
  expect(await allowed('other', 'Read', { file_path: '/code/api/CLAUDE.md' })).toBe(false)
  expect(await allowed(undefined, 'Read', { file_path: '/code/api/CLAUDE.md' })).toBe(false)
  // T-1211: the host's disk is looked at, so a link out of the repo gets no allow
  expect(await allowed('s1', 'Read', { file_path: '/code/api/keys/id_rsa' })).toBe(false)
  expect(await allowed('s1', 'Bash', { command: 'cat /code/api/passwd' })).toBe(false)
  scoutRuns.delete('s1')
  S.projects = {}
})

test('T-1211: a link in a project repo is judged by where it leads', async () => {
  const R = ['/code/api']
  // pointing outside every project: no auto-allow, for the Read tool and a shell read alike
  expect(await ok('Read', { file_path: '/code/api/keys/id_rsa' }, R)).toBe(false)
  expect(await ok('Read', { file_path: '/code/api/passwd' }, R)).toBe(false)
  expect(await ok('Bash', { command: 'cat /code/api/passwd' }, R)).toBe(false)
  expect(await ok('Bash', { command: 'head -n 5 /code/api/keys/id_rsa' }, R)).toBe(false)
  expect(await ok('Bash', { command: 'grep -rn key /code/api/keys' }, R)).toBe(false)
  expect(await ok('Bash', { command: 'cat /code/api/CLAUDE.md /code/api/passwd' }, R)).toBe(false)
  // into another project that is not one of the roots: no allow; when it is a root too: allowed
  expect(await ok('Read', { file_path: '/code/api/web/a' }, R)).toBe(false)
  expect(await ok('Read', { file_path: '/code/api/web/a' }, ['/code/api', '/code/web'])).toBe(true)
  // a link that leads nowhere (reading it can't be checked): no allow
  expect(await ok('Read', { file_path: '/code/api/nowhere' }, R)).toBe(false)
  // a link inside the same project, a plain file and a file that doesn't exist yet: still allowed
  expect(await ok('Read', { file_path: '/code/api/docs/x.md' }, R)).toBe(true)
  expect(await ok('Bash', { command: 'cat /code/api/docs/x.md' }, R)).toBe(true)
  expect(await ok('Read', { file_path: '/code/api/CLAUDE.md' }, R)).toBe(true)
  expect(await ok('Bash', { command: 'cat /code/api/CLAUDE.md' }, R)).toBe(true)
  expect(await ok('Read', { file_path: '/code/api/src/new.ts' }, R)).toBe(true)
  // a project root that is itself a link: both of its names count, the real one only as the root's own folder
  expect(await ok('Read', { file_path: '/lib/x' }, ['/lib'])).toBe(true)
  expect(await ok('Read', { file_path: '/real/lib/x' }, ['/lib'])).toBe(true)
  expect(await ok('Read', { file_path: '/real/other' }, ['/lib'])).toBe(false)
  // -R follows links met inside a folder, and wildcards turn into paths the check never saw
  for (const c of ['grep -R key /code/api', 'cat /code/api/*', 'grep -e /etc/* /code/api', 'grep /etc/pass* /code/api', 'ls /code/api/k?ys', 'find /code/api/* -type f', 'find /code/api -newer /code/api/*'])
    expect([c, await ok('Bash', { command: c }, R)]).toEqual([c, false])
})

test('reads inside a project path are allowed; edits, pipes and other paths are not', async () => {
  expect(await ok('Read', { file_path: '/code/api/CLAUDE.md' }, ['/code/api'])).toBe(true)
  expect(await ok('Read', { file_path: '/code/web/x' }, ['/code/api'])).toBe(false)
  expect(await ok('Read', { file_path: 'code/api/CLAUDE.md' }, ['/code/api'])).toBe(false)
  expect(await ok('Read', { file_path: '/code/api/../web/a' }, ['/code/api'])).toBe(false)
  expect(await ok('Bash', { command: 'cat /code/api/AGENTS.md' }, ['/code/api'])).toBe(true)
  expect(await ok('Bash', { command: 'grep -rn foo /code/api/src' }, ['/code/api'])).toBe(true)
  expect(await ok('Bash', { command: 'cat /code/api/a /etc/passwd' }, ['/code/api'])).toBe(false)
  expect(await ok('Bash', { command: 'cat /code/api/a > /code/api/b' }, ['/code/api'])).toBe(false)
  expect(await ok('Bash', { command: 'find /code/api -delete' }, ['/code/api'])).toBe(false)
  expect(await ok('Edit', { file_path: '/code/api/a' }, ['/code/api'])).toBe(false)
})

test('only the strict list of shell words and options is allowed', async () => {
  const R = ['/code/api']
  for (const c of [
    'sort -o x /code/api/f', 'sort -o/etc/x /code/api/a', 'sort --output=/etc/x /code/api/a', 'rg --pre sh p /code/api',
    'rg --pre=sh x /code/api', 'tree -o x /code/api', 'tree -o /code/api/out /code/api', 'file -C -m /code/api/m',
    'find /code/api -fprint x', 'find /code/api -exec rm {} +', 'find /code/api -delete', 'grep -r p /code/api > x',
    'cat /code/api/f | sh', 'cat /code/api/f x', 'grep --pre=sh p /code/api', 'ls -S /code/api', 'wc -L /code/api/f',
  ]) expect([c, await ok('Bash', { command: c }, R)]).toEqual([c, false])
  for (const c of [
    'cat -n /code/api/f', 'head -n 5 /code/api/f', 'head -5 /code/api/f', 'tail -c 10 /code/api/f', 'ls -laR /code/api',
    'ls -1th /code/api', 'wc -l /code/api/f', 'grep -rn foo /code/api/src', 'grep -A 3 -i foo /code/api/f',
    'grep -e foo -e bar /code/api', 'grep -rl --include=*.ts foo /code/api', 'grep --exclude-dir=node_modules -r foo /code/api',
    'find /code/api -name *.ts -type f -maxdepth 3', 'find /code/api -newer /code/api/a -size 1',
  ]) expect([c, await ok('Bash', { command: c }, R)]).toEqual([c, true])
})

test('T-1213: once grep has -e anywhere, every plain word is checked as a path', async () => {
  const R = ['/code/api']
  for (const c of [
    'grep /etc/hosts -e x /code/api/f', 'grep foo /code/api/f -e bar', 'grep -r /etc/hosts -e x /code/api',
    'grep -- /etc/hosts -e x /code/api/f', 'grep --regexp=x /etc/hosts', 'grep -f /etc/hosts /code/api/f', 'grep -e',
  ]) expect([c, await ok('Bash', { command: c }, R)]).toEqual([c, false])
  for (const c of ['grep /code/api/a -e x /code/api/f', 'grep -e x /code/api/f', 'grep /code/api/a -ex /code/api/f'])
    expect([c, await ok('Bash', { command: c }, R)]).toEqual([c, true])
})

const TABLE = { api:'/code/api', web: '/code/web', docs: '/code/docs' }
const base = { scout: 'bugs', root: '/board', instructions: 'Find bugs.', open: [] as string[], name: 'symcc' }

test('projects: in the front matter is read, and left out means none named', () => {
  expect(parseScout('s', '---\nevery_minutes: 30\nprojects: api, web\n---\nLook.\n')?.projects).toEqual(['api', 'web'])
  expect(parseScout('s', '---\nevery_minutes: 30\n---\nLook.\n')?.projects).toBe(undefined)
})

test('an unknown project name is refused with a reason', () => {
  expect(scoutProjectsError(['api', 'web'], TABLE)).toBe('')
  const why = scoutProjectsError(['api', 'nope'], TABLE)
  expect(why).toContain('unknown project "nope"')
  expect(why).toContain('api, docs, web')
  expect(scoutProjectsError(['x'], {})).toContain('no projects')
})

test('the scout prompt lists name: path; projects: limits the list; none named gets every project', () => {
  const all = scoutPrompt({ ...base, projects: scoutProjectTable(undefined, TABLE) })
  expect(all).toContain('api: /code/api, web: /code/web, docs: /code/docs')
  const some = scoutPrompt({ ...base, projects: scoutProjectTable(['web'], TABLE) })
  expect(some).toContain('web: /code/web')
  expect(some).not.toContain('/code/api')
  expect(some).toContain('CLAUDE.md and AGENTS.md by full path')
})

test('a board with no projects: the scout prompt has nothing about projects', () => {
  const p = scoutPrompt(base)
  expect(p).toBe(scoutPrompt({ ...base, projects: {} }))
  expect(p).not.toContain('projects')
  expect(p).not.toContain('CLAUDE.md')
})

test('scoutText keeps, sets and clears the projects line; the lead sees a scout\'s projects', () => {
  const old = '---\nevery_minutes: 30\nprojects: api\n---\n\nLook.\n'
  expect(scoutText(old, { every_minutes: 30 }, 'Look.')).toContain('projects: api')
  expect(scoutText(old, { every_minutes: 30, projects: ['api', 'web'] }, 'Look.')).toContain('projects: api, web')
  expect(scoutText(old, { every_minutes: 30, projects: [] }, 'Look.')).not.toContain('projects')
  expect(scoutText(null, { every_minutes: 30, projects: ['web'] }, 'Look.')).toContain('projects: web')
  const st: SymccScout & { projects?: string[] } = { name: 'bugs', every_minutes: 30, last_run: null, running: false, projects: ['api', 'web'] }
  expect(leadScoutText(st, Date.now())).toContain('projects: api, web')
  expect(leadScoutText({ ...st, projects: undefined }, Date.now())).not.toContain('projects:')
})

const task = (over: Partial<SymccTask> = {}): SymccTask =>
  ({ id: 'T-7', title: 'Do it', details: 'Make it work.', files: ['a.ts'], status: 'doing', note: '', priority: 1, after: [], attempts: 1, timeline: [], branch: null, created_at: '', updated_at: '', origin: { by: 'owner', why: 'x', request: 'y', at: '' }, ...over }) as SymccTask
const values = (t: SymccTask): Record<string, string> => ({ name: 'symcc', task_id: t.id, title: t.title, details: t.details, branch: 'symcc/T-7', folder: '/w/T-7', kind: '', kind_name: 'change', role_name: 'general', role: '', org_mem: '', learned: '', ask: 'ASK', files: 'F', test_command: 'TESTS', file_tools: 'Edit' })

test('the worker prompt for a project task says to read the repo CLAUDE.md and AGENTS.md; without a project it does not', () => {
  const t = task({ project: 'api' } as Partial<SymccTask>)
  const p = fillPrompt('change', values(t), t)
  expect(p).toContain('Read /w/T-7/CLAUDE.md and /w/T-7/AGENTS.md')
  const plain = task()
  expect(fillPrompt('change', values(plain), plain)).not.toContain('AGENTS.md')
})
