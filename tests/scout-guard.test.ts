// T-433: a scout runs in the owner's own folder, so its git writes in Bash and its edits of project files are refused;
// its tests, read-only git and throwaway files under /tmp are allowed. Worker and checker guards are unchanged.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { checkEdit } from '../hooks/app/ask'
import { gitWriteText, workerGitWriteText, scoutGitWriteText, scoutEditText, editInProject } from '../hooks/board'
import { S, scoutRuns, workers, checkerRuns } from '../hooks/app/state'
import { fakeHost } from './fake-host'

const ROOT = '/repo'
const WT = `${ROOT}/.symcc/worktrees/T-1`

function setup() {
  S.root = ROOT
  scoutRuns.set('s1', 'gaps-bot')
  return fakeHost().host
}

test("a scout's git writes in Bash are refused with the scout's reason, wherever its shell is", async () => {
  const $ = setup()
  for (const [command, what] of [
    ['git stash', 'git stash'],
    ['git checkout main', 'git checkout'],
    ['git reset --hard', 'git reset'],
    ['git commit -am x', 'git commit'],
    ['cd /tmp && git -C /repo push', 'git push'],
    ['sh -c "git merge main"', 'git merge'],
    ['GIT_DIR=/repo/.git git log', 'GIT_DIR'],
    ['git diff --output=/repo/x', 'git diff --output'],
  ] as const) {
    expect(await checkEdit($, 's1', { command })).toBe(scoutGitWriteText(what))
    expect(await checkEdit($, 's1', { command }, ROOT)).toBe(scoutGitWriteText(what))
  }
  expect(scoutGitWriteText('git stash')).toMatch(/^Refused: git stash may change the repository or run another program, and a scout may only read with git/)
})

test("a scout's read-only git, its tests and its /tmp probes are allowed", async () => {
  const $ = setup()
  for (const command of ['git status', 'git diff', 'git log -3', 'git log --oneline -5', 'git stash list', 'git branch --list', 'claude plugin test .', 'sh scripts/typecheck.sh', 'npm test', 'echo probe > /tmp/x && cat /tmp/x', `cat ${ROOT}/README.md`])
    expect(await checkEdit($, 's1', { command }, ROOT)).toBeUndefined()
})

test("a scout's file edits inside the project are refused, outside it (/tmp) they are allowed", async () => {
  const $ = setup()
  expect(await checkEdit($, 's1', { path: `${ROOT}/README.md` })).toBe(scoutEditText('README.md'))
  expect(await checkEdit($, 's1', { path: 'src/a.ts' })).toBe(scoutEditText('src/a.ts'))
  expect(await checkEdit($, 's1', { path: `${ROOT}/.symcc/board.json` })).toBe(scoutEditText('.symcc/board.json'))
  expect(await checkEdit($, 's1', { path: '/tmp/../repo/x' })).toBe(scoutEditText('x'))
  expect(await checkEdit($, 's1', { path: '/REPO/x' })).toBe(scoutEditText('x'))
  expect(await checkEdit($, 's1', { path: '/tmp/probe.ts' })).toBeUndefined()
  expect(await checkEdit($, 's1', { path: '/private/tmp/probe.ts' })).toBeUndefined()
  expect(await checkEdit($, 's1', { path: '/repository/x' })).toBeUndefined()
  expect(editInProject(undefined, ROOT)).toBeUndefined()
})

test('the lead and unknown agents are not checked; worker and checker guards keep their own reasons', async () => {
  const $ = setup()
  expect(await checkEdit($, undefined, { command: 'git stash' })).toBeUndefined()
  expect(await checkEdit($, 'someone-else', { command: 'git stash' })).toBeUndefined()
  checkerRuns.set('c1', { task: 'T-1', worktree: WT, end: () => undefined })
  expect(await checkEdit($, 'c1', { command: 'git stash' })).toBe(gitWriteText('git stash'))
  expect(await checkEdit($, 'c1', { command: 'git status' })).toBeUndefined()
  workers.set('w1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
  expect(await checkEdit($, 'w1', { command: 'git reset --hard' }, WT)).toBe(workerGitWriteText('git reset'))
  expect(await checkEdit($, 'w1', { command: 'git diff' }, WT)).toBeUndefined()
})
