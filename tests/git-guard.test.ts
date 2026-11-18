// T-439: the git guard counts `git` only where it runs as a command, so "git" as search text, an argument or in a path
// no longer refuses a worker's or a scout's command; clearly read-only git (remote -v, config --get, reflog) passes too.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { checkEdit } from '../hooks/plugin/ask'
import { gitWriteIn, gitWriteText, workerGitWriteText, scoutGitWriteText } from '../hooks/board'
import { S, scoutRuns, workers, checkerRuns } from '../hooks/plugin/state'
import { fakeHost } from './fake-host'

const ROOT = '/repo'
const WT = `${ROOT}/.symcc/worktrees/T-1`

function setup() {
  S.root = ROOT
  scoutRuns.set('s1', 'gaps-bot')
  workers.set('w1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
  checkerRuns.set('c1', { task: 'T-1', worktree: WT, end: () => undefined })
  return fakeHost().host
}

const READS = [
  'grep -n "git" docs/guide.md',
  'grep -rn git hooks',
  'rg "git stash" .',
  'rg git',
  'git remote -v',
  'git remote',
  'git remote get-url origin',
  'git config --get user.name',
  'git config --list --show-origin',
  'git config get user.name',
  'git reflog',
  'git reflog show HEAD -5',
  'git rev-parse --show-toplevel',
  'git ls-files hooks',
  'git cat-file -p HEAD',
  'git describe --tags',
  'git show-ref --heads',
  'git worktree list',
  'git branch --list',
  'cat hooks/git-stash.md',
  'echo "git commit later" | wc -l',
  'grep -c "git reset --hard" docs/guide.md && grep -n git README.md',
  'sh -c "grep -n git docs/guide.md"',
  'ls .git',
]

const WRITES: [string, string][] = [
  ['sh -c "git commit"', 'git commit'],
  ['bash -c \'git stash\'', 'git stash'],
  ['x=1 git commit', 'git commit'],
  ['sudo git push', 'git push'],
  ['sudo -u root git push', 'git push'],
  ['env -i git reset --hard', 'git reset'],
  ['command git stash', 'git stash'],
  ['exec git commit', 'git commit'],
  ['timeout 5 git push', 'git push'],
  ['if git stash; then echo; fi', 'git stash'],
  ['! git commit', 'git commit'],
  ['eval git stash', 'git stash'],
  ['eval "git stash"', 'git stash'],
  ['find . -exec git add {} ;', 'git add'],
  ['echo "$(git stash)"', 'git stash'],
  ['echo "`git stash`"', 'git stash'],
  ["perl -e 'system \"git stash\"'", 'git stash'],
  ['awk \'BEGIN { system("git commit -m x") }\'', 'git commit'],
  ['echo stash | xargs git', 'xargs git'],
  ['ls | xargs git log', 'xargs git'],
  ['git-stash', 'git stash'],
  ['git fetch', 'git fetch'],
  ['git gc', 'git gc'],
  ['git remote add x /tmp/x', 'git remote'],
  ['git remote remove origin', 'git remote'],
  ['git remote set-url origin x', 'git remote'],
  ['git remote show origin', 'git remote'],
  ['git remote prune origin', 'git remote'],
  ['git config user.name x', 'git config'],
  ['git config --add user.name x', 'git config'],
  ['git config --get user.name --unset', 'git config'],
  ['git config --file /tmp/c --get x', 'git config'],
  ['git config --edit', 'git config'],
  ['git config set user.name x', 'git config'],
  ['git reflog expire --all', 'git reflog'],
  ['git reflog delete HEAD@{1}', 'git reflog'],
  ['git reflog --output=/tmp/x', 'git reflog --output'],
  ['git reflog -o /tmp/x', 'git reflog -o'],
  ['git cat-file --filters HEAD:a', 'git cat-file --filters'],
  ['git cat-file --filter HEAD:a', 'git cat-file --filter'],
  ['git worktree add /tmp/x', 'git worktree'],
  ['git branch x', 'git branch'],
  ["X='git stash;:' true", 'git stash'],
  ['echo -X"git reset --hard"', 'git reset'],
]

test('"git" as text and read-only git pass for a worker, a scout and a checker (T-439)', async () => {
  const $ = setup()
  for (const command of READS) {
    expect([command, gitWriteIn(command)]).toEqual([command, undefined])
    expect(await checkEdit($, 'w1', { command }, WT)).toBeUndefined()
    expect(await checkEdit($, 's1', { command }, ROOT)).toBeUndefined()
    expect(await checkEdit($, 'c1', { command }, WT)).toBeUndefined()
  }
})

test('git run as a command still refuses its writes, for a worker, a scout and a checker (T-439)', async () => {
  const $ = setup()
  for (const [command, what] of WRITES) {
    expect([command, gitWriteIn(command)]).toEqual([command, what])
    expect(await checkEdit($, 'w1', { command }, WT)).toBe(workerGitWriteText(what))
    expect(await checkEdit($, 's1', { command }, ROOT)).toBe(scoutGitWriteText(what))
    expect(await checkEdit($, 'c1', { command }, WT)).toBe(gitWriteText(what))
  }
})
