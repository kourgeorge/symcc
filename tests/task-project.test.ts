// T-1205: one taskProject helper reads a task's project; checkProjects forgets exactly the repos openProjects leaves out.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { S } from '../hooks/app/state'
import { taskProject, projectGone, repoOf, openProjects, checkProjects } from '../hooks/app/git'
import { emptyBoard, type Board } from '../hooks/board'
import { fakeHost } from './fake-host'

test('T-1205: taskProject treats a missing, null or empty project as none', () => {
  expect(taskProject(undefined)).toBe(undefined)
  expect(taskProject(null)).toBe(undefined)
  expect(taskProject({})).toBe(undefined)
  expect(taskProject({ project: null })).toBe(undefined)
  expect(taskProject({ project: '' })).toBe(undefined)
  expect(taskProject({ project: 'api' })).toBe('api')
  S.root = '/ws'
  S.projects = { api: '/elsewhere/api' }
  expect(projectGone({ project: '' })).toBe('')
  expect(projectGone({ project: 'gone' })).toBe("project 'gone' is not in this board's project table")
  expect(repoOf({ project: null })).toBe('/ws')
  expect(repoOf({ project: 'api' })).toBe('/elsewhere/api')
})

test('T-1205: checkProjects forgets the repos of projects with no open task, keeps the open ones', async () => {
  S.projects = { api: '/elsewhere/api', client: '/ws/client', old: '/ws/old' }
  const b = emptyBoard() as Board
  b.tasks.push(
    { id: 'T-1', status: 'todo', project: 'api' } as Board['tasks'][number],
    { id: 'T-2', status: 'backlog', project: 'client' } as Board['tasks'][number],
    { id: 'T-3', status: 'done', project: 'old' } as Board['tasks'][number],
  )
  expect(openProjects(b)).toEqual(['api'])
  S.repoGit.set('/elsewhere/api', 'no-repo')
  S.repoGit.set('/ws/client', 'no-repo')
  S.repoGit.set('/ws/old', 'no-repo')
  S.gitState = 'no-git'
  await checkProjects(fakeHost().host, b)
  expect([...S.repoGit.keys()]).toEqual(['/elsewhere/api'])
})
