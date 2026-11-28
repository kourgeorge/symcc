// T-1200: scouts name their projects (front matter projects:), the scout prompt lists name: path, an unknown project is
// refused with a reason, and a worker's prompt for a project task says to read the repo's CLAUDE.md / AGENTS.md. A board
// with no projects gets the same prompts as before. All pure.
import { expect, test } from 'claude-code/testing'
import type { SymccScout, SymccTask } from '../types'
import { parseScout, scoutText, scoutPrompt, scoutProjectsError, scoutProjectTable, leadScoutText, scoutListRows } from '../hooks/core/scouts'
import { fillPrompt } from '../hooks/core/prompts'
import { readInsideProjects as ok } from '../hooks/claude/project-reads'
import { readAllowed } from '../hooks/app/ask'
import { S, scoutRuns } from '../hooks/app/state'

test('symcc answers allow only for a symcc scout reading inside a project path', () => {
  S.root = '/board'
  S.projects = { api: '/code/api' }
  scoutRuns.set('s1', 'bugs')
  expect(readAllowed('s1', r => ok('Read', { file_path: '/code/api/CLAUDE.md' }, r))).toBe(true)
  expect(readAllowed('s1', r => ok('Bash', { command: 'cat /code/api/AGENTS.md' }, r))).toBe(true)
  expect(readAllowed('s1', r => ok('Bash', { command: 'ls /code/api/src' }, r))).toBe(true)
  expect(readAllowed('s1', r => ok('Read', { file_path: '/etc/passwd' }, r))).toBe(false)
  expect(readAllowed('s1', r => ok('Edit', { file_path: '/code/api/a' }, r))).toBe(false)
  expect(readAllowed('other', r => ok('Read', { file_path: '/code/api/CLAUDE.md' }, r))).toBe(false)
  expect(readAllowed(undefined, r => ok('Read', { file_path: '/code/api/CLAUDE.md' }, r))).toBe(false)
  scoutRuns.delete('s1')
  S.projects = {}
})

test('reads inside a project path are allowed; edits, pipes and other paths are not', () => {
  expect(ok('Read', { file_path: '/code/api/CLAUDE.md' }, ['/code/api'])).toBe(true)
  expect(ok('Read', { file_path: '/code/web/x' }, ['/code/api'])).toBe(false)
  expect(ok('Bash', { command: 'cat /code/api/AGENTS.md' }, ['/code/api'])).toBe(true)
  expect(ok('Bash', { command: 'grep -rn foo /code/api/src' }, ['/code/api'])).toBe(true)
  expect(ok('Bash', { command: 'cat /code/api/a /etc/passwd' }, ['/code/api'])).toBe(false)
  expect(ok('Bash', { command: 'cat /code/api/a > /code/api/b' }, ['/code/api'])).toBe(false)
  expect(ok('Bash', { command: 'find /code/api -delete' }, ['/code/api'])).toBe(false)
  expect(ok('Edit', { file_path: '/code/api/a' }, ['/code/api'])).toBe(false)
})

test('only the strict list of shell words and options is allowed', () => {
  const R = ['/code/api']
  for (const c of [
    'sort -o x /code/api/f', 'sort -o/etc/x /code/api/a', 'sort --output=/etc/x /code/api/a', 'rg --pre sh p /code/api',
    'rg --pre=sh x /code/api', 'tree -o x /code/api', 'tree -o /code/api/out /code/api', 'file -C -m /code/api/m',
    'find /code/api -fprint x', 'find /code/api -exec rm {} +', 'find /code/api -delete', 'grep -r p /code/api > x',
    'cat /code/api/f | sh', 'cat /code/api/f x', 'grep --pre=sh p /code/api', 'ls -S /code/api', 'wc -L /code/api/f',
  ]) expect([c, ok('Bash', { command: c }, R)]).toEqual([c, false])
  for (const c of [
    'cat -n /code/api/f', 'head -n 5 /code/api/f', 'head -5 /code/api/f', 'tail -c 10 /code/api/f', 'ls -laR /code/api',
    'ls -1th /code/api', 'wc -l /code/api/f', 'grep -rn foo /code/api/src', 'grep -A 3 -i foo /code/api/f',
    'grep -e foo -e bar /code/api', 'grep -rl --include=*.ts foo /code/api', 'grep --exclude-dir=node_modules -r foo /code/api',
    'find /code/api -name *.ts -type f -maxdepth 3', 'find /code/api -newer /code/api/a -size 1',
  ]) expect([c, ok('Bash', { command: c }, R)]).toEqual([c, true])
})

const TABLE = { api: '/code/api', web: '/code/web', docs: '/code/docs' }
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

test('the Scouts list names the project problem, not every_minutes', () => {
  const d = parseScout('bugs', '---\nevery_minutes: 30\nprojects: api, nope\n---\nLook.\n', { api: '/code/api' })!
  const row = scoutListRows([{ name: d.name, every_minutes: d.every_minutes, last_run: null, running: false, prompt: d.prompt, next_run: new Date(Date.now() + 600000).toISOString(), warning: d.warning } as SymccScout], Date.now(), 100)[0]!
  expect(row.state).toContain('unknown project')
  expect(row.state).not.toContain('every_minutes')
  expect(row.stateTone).toBe('warning')
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
