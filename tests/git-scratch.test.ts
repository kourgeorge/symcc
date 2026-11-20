// T-591: workers and checkers may run git writes in throwaway repositories under /tmp (or the system temp folder)
// named by plain literal paths; git aimed at the project, .symcc/, a worktree, or a folder that can't be told (a
// variable, mktemp, ~, ..) stays refused, and scouts stay read-only. A simple rule, not a security boundary.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { checkEdit } from '../hooks/app/ask'
import { gitWriteIn, gitWriteText, workerGitWriteText, scoutGitWriteText, literalPath, scratchTemps, scratchGitAllow } from '../hooks/board'
import { S, scoutRuns, workers, checkerRuns } from '../hooks/app/state'
import { fakeHost } from './fake-host'

const ROOT = '/repo'
const WT = `${ROOT}/.symcc/worktrees/T-1`

function setup(tmpdir?: string) {
  S.root = ROOT
  scoutRuns.set('s1', 'gaps-bot')
  workers.set('w1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
  checkerRuns.set('c1', { task: 'T-1', worktree: WT, end: () => undefined })
  return fakeHost({ env: async name => (name === 'TMPDIR' ? tmpdir : undefined) }).host
}

const ALLOWED = [
  'git init /tmp/x',
  'git init -q /tmp/x',
  'git init -b main "/tmp/my x"',
  "git init '/private/tmp/x'",
  'git -C /tmp/x add . && git -C /tmp/x commit -m m',
  'cd /tmp/x && git commit -am m',
  'cd /tmp/x && git init && git add . && git commit -m "first: see /docs"',
  'mkdir -p /tmp/x && cd /tmp/x && git init && echo a > f && git add f && git commit -qm m',
  'git -C /tmp/x config user.name me && git -C /tmp/x config user.email me@x',
  'git -C /tmp/x checkout -b side && git -C /tmp/x merge main',
  'git -C /tmp/x commit -m m > /dev/null 2>&1',
  'cd /tmp && git init x',
  'git -C /tmp/a clone /tmp/b c',
  'git -C /tmp/x commit --author="A B <a@b>" -m "a b"',
  'git -C /tmp/x rebase -x make HEAD~1',
  'git -C /tmp/x commit -am "fix the bug"',
  'git -C /tmp/x tag -m "v 1" v1',
  'git -C /tmp/x rebase -m HEAD~1',
  'git -C /tmp/x commit -m "-- see cd here"',
  'git -C /tmp/x config -f /tmp/x/extra.cfg user.name me',
  'git -C /tmp/x config -fextra.cfg user.name me',
]

const REFUSED = [
  // the project, .symcc/, the worktree
  'git -C /repo commit -m m',
  'git -C /repo/.symcc add .',
  `git -C ${WT} commit -am m`,
  `cd ${WT} && git commit -am m`,
  'git init /repo/.symcc/x',
  'git commit -am m',
  // folders that can't be told
  'git -C $TMPDIR/x commit -m m',
  'git -C "$TMPDIR/x" commit -m m',
  'd=/tmp/x; git -C $d commit -m m',
  'cd $d && git commit -m m',
  'git init $(mktemp -d)',
  'cd $(mktemp -d) && git init',
  'cd `mktemp -d` && git init',
  'git -C ~/x commit -m m',
  'cd ~/x && git init',
  'git -C /tmp/../repo commit -m m',
  'cd /tmp/x/.. && git commit -m m',
  'git init /tmp/*',
  'git -C /tmp/"x" commit -m m',
  'git -C x commit -m m',
  // a cd that may fail, or whose effect is lost
  'cd /tmp/x; git commit -am m',
  'cd /tmp/x || git commit -am m',
  'false || cd /tmp/x && git commit -am m',
  'cd /tmp/x && true || git commit -am m',
  '(cd /tmp/x && git init) && git commit -am m',
  'cd /tmp/x | git commit -am m',
  // aimed elsewhere from a scratch repo
  `git -C /tmp/x push ${WT} HEAD:refs/heads/main`,
  'git -C /tmp/x push /repo main',
  'git -C /tmp/x remote add o ../../repo',
  'git -C /tmp/x fetch file:///repo',
  'git -C /tmp/x push https://example.com/r main',
  'git -C /tmp/x --git-dir=/repo/.git commit -m m',
  'git -C /tmp/x --work-tree /repo add .',
  'git init --separate-git-dir /repo/.git /tmp/x',
  'git -C /tmp/x push ~/r',
  // the owner's or the system's git settings, outside the scratch folder
  'git -C /tmp/x config --global user.name x',
  'git -C /tmp/x config --system user.name x',
  'git -C /tmp/x config --global core.hooksPath /tmp/h',
  'cd /tmp/x && git config --global user.email me@x',
  // a command given as one quoted word, aimed at the worktree
  `git -C /tmp/x rebase -x 'git -C ${WT} commit -am x' HEAD~1`,
  `git -C /tmp/x rebase -x 'cd ${WT} && git reset --hard HEAD~3' HEAD~1`,
  `git -C /tmp/x config alias.z '!git -C ${WT} reset --hard'`,
  "git -C /tmp/x config alias.z '!cd; git reset --hard'",
  `git -C /tmp/x filter-branch --tree-filter 'cp f ${WT}/f' HEAD`,
  `git -C /tmp/x bisect run sh -c 'git -C ${WT} commit -am x'`,
  `git -C /tmp/x push --receive-pack='git -C ${WT} receive-pack' /tmp/y`,
  `git -C /tmp/x fetch --upload-pack=${WT}/up /tmp/y`,
  `git -C /tmp/x rebase -x"cd ../.." HEAD~1`,
  // not at the line's top
  "sh -c 'git -C /tmp/x commit -m m'",
  'sudo git -C /tmp/x commit -m m',
  'GIT_DIR=/repo/.git git -C /tmp/x commit -m m',
  // `-m` is a message only for commit, tag, merge, notes and stash (for rebase it is --merge)
  `git -C /tmp/x rebase -m --exec="git -C ${WT} reset --hard HEAD~3" HEAD~1`,
  `git -C /tmp/x push -m ${WT} HEAD:main`,
  `git -C /tmp/x rebase -mx"git -C ${WT} reset --hard" HEAD~1`,
  // shortened --global / --system
  'git -C /tmp/x config --glob core.hooksPath /tmp/h',
  'git -C /tmp/x config --glo user.name x',
  'git -C /tmp/x config --syst user.name x',
  'git -C /tmp/x config --global=x user.name x',
  // config -f / --file outside the scratch folder
  'git -C /tmp/x config -f ~/.gitconfig user.name x',
  'git -C /tmp/x config -f~/.gitconfig user.name x',
  'git -C /tmp/x config -f../y/.git/config user.name x',
  `git -C /tmp/x config -f${WT}/.git/config user.name x`,
  `git -C /tmp/x config -f ${WT}/.git/config user.name x`,
  `git -C /tmp/x config --file=${WT}/.git/config user.name x`,
  'git -C /tmp/x config --file ../y/config user.name x',
  // a cd with a word before it, or text run again, may change folder
  `cd /tmp/x && builtin cd ${WT} && git commit -am m`,
  `cd /tmp/x && command cd ${WT} && git reset --hard HEAD~3`,
  `cd /tmp/x && x=1 cd ${WT} && git commit -am m`,
  `cd /tmp/x && 'cd' ${WT} && git commit -am m`,
  `cd /tmp/x && eval cd ${WT} && git commit -am m`,
  'cd /tmp/x && source ./f && git commit -am m',
  'cd /tmp/x && $c /repo && git commit -am m',
]

test('a worker and a checker may run git writes in /tmp scratch repos named by plain literal paths (T-591)', async () => {
  const $ = setup()
  for (const command of ALLOWED) {
    expect([command, await checkEdit($, 'w1', { command }, WT)]).toEqual([command, undefined])
    expect([command, await checkEdit($, 'c1', { command }, WT)]).toEqual([command, undefined])
  }
})

test('git writes aimed at the project, .symcc/, the worktree, or a folder that cannot be told stay refused (T-591)', async () => {
  const $ = setup()
  for (const command of REFUSED) {
    const what = gitWriteIn(command)!
    expect([command, typeof what]).toEqual([command, 'string'])
    // a worker's command that names the owner's copy is refused for that first (bashOutsideText)
    const w = await checkEdit($, 'w1', { command }, WT)
    expect([command, w === workerGitWriteText(what) || w?.includes("in the owner's copy of the project")]).toEqual([command, true])
    expect([command, await checkEdit($, 'c1', { command }, WT)]).toEqual([command, gitWriteText(what)])
  }
})

test('a scout stays read-only with git, even in /tmp (T-591)', async () => {
  const $ = setup()
  for (const command of ['git init /tmp/x', 'git -C /tmp/x commit -m m', 'cd /tmp/x && git commit -am m']) {
    expect(await checkEdit($, 's1', { command }, ROOT)).toBe(scoutGitWriteText(gitWriteIn(command)!))
  }
})

test('the shell folder counts when it is under /tmp, never when it is the worktree (T-591)', async () => {
  const $ = setup()
  expect(await checkEdit($, 'w1', { command: 'git commit -am m' }, '/tmp/x')).toBeUndefined()
  expect(await checkEdit($, 'c1', { command: 'git add . && git commit -m m' }, '/private/tmp/x')).toBeUndefined()
  expect(await checkEdit($, 'w1', { command: 'git commit -am m' }, WT)).toBe(workerGitWriteText('git commit'))
  expect(await checkEdit($, 'c1', { command: 'cd /repo && git commit -am m' }, '/tmp/x')).toBe(gitWriteText('git commit'))
  expect(await checkEdit($, 'w1', { command: 'cd /repo && git commit -am m' }, '/tmp/x')).toBeDefined()
})

test('the system temp folder counts only under /var/folders (T-591)', async () => {
  const sys = '/var/folders/ab/cd123/T'
  expect(scratchTemps(sys)).toEqual(['/tmp', sys])
  expect(scratchTemps(`${sys}/`)).toEqual(['/tmp', sys])
  expect(scratchTemps('/Users/me')).toEqual(['/tmp'])
  expect(scratchTemps('/')).toEqual(['/tmp'])
  expect(scratchTemps('/var/folders/../../repo')).toEqual(['/tmp'])
  expect(scratchTemps(undefined)).toEqual(['/tmp'])
  const $ = setup(sys)
  expect(await checkEdit($, 'w1', { command: `git init ${sys}/x` }, WT)).toBeUndefined()
  expect(await checkEdit($, 'w1', { command: `git -C /private${sys}/x commit -m m` }, WT)).toBeUndefined()
  const other = setup('/Users/me')
  expect(await checkEdit(other, 'w1', { command: 'git init /Users/me/x' }, WT)).toBe(workerGitWriteText('git init'))
})

test('a project or worktree under /tmp is still refused (T-591)', () => {
  const allow = scratchGitAllow(scratchTemps(), ['/tmp/proj', '/tmp/proj/.symcc/worktrees/T-1'])
  expect(gitWriteIn('git -C /tmp/proj commit -m m', allow)).toBe('git commit')
  expect(gitWriteIn('git -C /TMP/PROJ/.symcc commit -m m', allow)).toBe('git commit')
  expect(gitWriteIn('git init /tmp/proj/.symcc/worktrees/T-1/x', allow)).toBe('git init')
  expect(gitWriteIn('git -C /tmp/other commit -m m', allow)).toBeUndefined()
  // /tmp itself is no scratch repo
  expect(gitWriteIn('git -C /tmp commit -m m', allow)).toBe('git commit')
})

test('literalPath takes only plain literal absolute paths (T-591)', () => {
  expect(literalPath('/tmp/x')).toBe('/tmp/x')
  expect(literalPath('"/tmp/a b"')).toBe('/tmp/a b')
  expect(literalPath("'/tmp/x/'")).toBe('/tmp/x')
  for (const bad of ['tmp/x', '$TMPDIR/x', '"$TMPDIR"', '~/x', '/tmp/../repo', '/tmp/*', '/tmp/"x"', '/tmp/a b', '`mktemp`', '/tmp/x\\y']) expect([bad, literalPath(bad)]).toEqual([bad, undefined])
})

test('a refused git write tells a worker and a checker the /tmp way, but not a scout (T-591)', async () => {
  const $ = setup()
  const tip = 'A scratch repository under /tmp with a plain path is fine (e.g. git init /tmp/x, git -C /tmp/x commit -m m); no $TMPDIR, $(mktemp), ~ or ..'
  const command = 'git -C $TMPDIR/x commit -m m'
  const w = await checkEdit($, 'w1', { command }, WT)
  const c = await checkEdit($, 'c1', { command }, WT)
  expect(w).toBe(workerGitWriteText('git commit'))
  expect(c).toBe(gitWriteText('git commit'))
  expect(w).toContain(tip)
  expect(c).toContain(tip)
  expect(scoutGitWriteText('git commit')).not.toContain('/tmp')
})
