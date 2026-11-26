// T-1062: the slim worker guards. One git deny list (core/git-guard.ts) read as plain text, used by the hook guard
// and turned into the Node host's Claude Code rules; and one shell path rule (no owner's folder in the text, no `..`).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { checkEdit } from '../hooks/app/ask'
import { gitWriteIn, gitPlaceOk, gitDeniedRules, gitWriteText, workerGitWriteText, scoutGitWriteText, bashOutsideFolder, bashOutsideText, BASH_DOTDOT, BASH_ABOVE, shellCwd } from '../hooks/board'
import { S, scoutRuns, workers, checkerRuns } from '../hooks/app/state'
import { fakeHost } from './fake-host'

const ROOT = '/Users/o/repo'
const WT = `${ROOT}/.symcc/worktrees/T-1`

function setup() {
  S.root = ROOT
  scoutRuns.set('s1', 'gaps-bot')
  workers.set('w1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
  checkerRuns.set('c1', { task: 'T-1', worktree: WT, end: () => undefined })
  return fakeHost().host
}

/**
 * Whether Claude Code's rule list `rules` refuses `command`, matched the way its Bash rules are: `Bash(x:*)` is the
 * command x or x followed by more words, any other `*` stands for any text.
 */
function nodeRefuses(rules: string[], command: string): boolean {
  return rules.some(r => {
    const inner = /^Bash\((.*)\)$/.exec(r)?.[1]
    if (!inner) return false
    if (inner.endsWith(':*')) return command === inner.slice(0, -2) || command.startsWith(`${inner.slice(0, -2)} `)
    return new RegExp(`^${inner.split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(command)
  })
}

/** Refused for a worker by both the hook guard and the Node rules. */
const WORKER_REFUSED = [
  'git push', 'git push origin main', 'git tag v1', 'git config user.name x', 'git update-ref refs/heads/main HEAD', 'git symbolic-ref HEAD refs/heads/main',
  'git branch -D symcc/T-7', 'git branch new', 'git switch main', 'git checkout main', 'git worktree add /tmp/x main', 'git stash', 'git stash pop',
  'git fetch origin', 'git pull', 'git remote add x y', `git -C ${ROOT} commit -m x`, 'git -c user.name=x commit -m x', 'git --git-dir=/x/.git commit -m x',
  'git rebase main other', 'git rebase --exec=true main', "git rebase -x 'git push origin main' HEAD~1", 'git bisect run git push', 'git bisect reset other', 'git merge --autostash main',
  // git commands by other names: send-pack is a push, checkout-index overwrites files, any not known to only read
  'git send-pack --force . HEAD:refs/heads/x', 'git checkout-index -f -a', 'git receive-pack .', 'git http-push x', 'git replay --onto main a..b', 'git archive -o x.zip HEAD',
]

/** Allowed for a worker (in its own folder) by both. */
const WORKER_ALLOWED = ['git commit -am x', 'git merge main', 'git cherry-pick abc', 'git revert HEAD', 'git restore a.ts', 'git reset --hard HEAD~1', 'git rebase main', 'git rebase --continue', 'git add -A', 'git bisect start', 'git status', 'git log -3']

test('T-1062: the worker deny list refuses the same commands in the hook guard and in the Node rules', () => {
  const node = gitDeniedRules(true)
  for (const c of WORKER_REFUSED) {
    expect([c, typeof gitWriteIn(c, 'worker')]).toEqual([c, 'string'])
    expect([c, nodeRefuses(node, c)]).toEqual([c, true])
  }
  for (const c of WORKER_ALLOWED) {
    expect([c, gitWriteIn(c, 'worker')]).toEqual([c, undefined])
    expect([c, nodeRefuses(node, c)]).toEqual([c, false])
  }
  // files only: the hook guard reads the words; Claude Code's rules only see how a command starts, so the Node host
  // refuses checkout whole (git restore does the same) and a rebase with more than one word
  expect(gitWriteIn('git checkout -- a.ts', 'worker')).toBe(undefined)
  expect(gitWriteIn('git checkout main -- a.ts', 'worker')).toBe(undefined)
  expect(nodeRefuses(node, 'git checkout -- a.ts')).toBe(true)
  expect(gitWriteIn('git rebase -i HEAD~3', 'worker')).toBe(undefined)
  expect(nodeRefuses(node, 'git rebase -i HEAD~3')).toBe(true)
})

test("T-1062: a scout's and a checker's git writes are refused in the hook guard and in the Node rules", () => {
  const node = gitDeniedRules(false)
  for (const c of [...WORKER_REFUSED, 'git commit -am x', 'git merge main', 'git cherry-pick abc', 'git restore a.ts', 'git checkout -- a.ts', 'git rebase main', 'git add -A', 'git stage .', 'git init /tmp/x']) {
    expect([c, typeof gitWriteIn(c)]).toEqual([c, 'string'])
    expect([c, nodeRefuses(node, c)]).toEqual([c, true])
  }
  for (const c of ['git status', 'git diff main...HEAD', 'git log --oneline -5', 'git show HEAD:a.ts', 'git blame a.ts', 'git rev-parse HEAD', 'git ls-files']) {
    expect([c, gitWriteIn(c)]).toEqual([c, undefined])
    expect([c, nodeRefuses(node, c)]).toEqual([c, false])
  }
  // only listing branches is fine in the hook guard
  expect(gitWriteIn('git branch --list')).toBe(undefined)
  expect(gitWriteIn('git branch -a')).toBe(undefined)
})

test('T-1062: the git text is read whole: git inside quotes, after a wrapper, or by its own program name counts', () => {
  for (const [c, what] of [
    ['sh -c "git push"', 'git push'],
    ["bash -c 'git stash'", 'git stash'],
    ['echo "$(git stash)"', 'git stash'],
    ['x=1 git push', 'git push'],
    ['/usr/bin/git push', 'git push'],
    ['/usr/libexec/git-core/git-update-ref refs/heads/main HEAD', 'git update-ref'],
    ['git --no-pager -C /x commit', 'git -C'],
    ['git --exec-path=/x commit', 'git --exec-path'],
    ['git --work-tree=/x commit', 'git --work-tree'],
    ['git --config-env=core.pager=X log', 'git --config-env'],
    ['GIT_DIR=/x git log', 'a GIT_ setting'],
    ['export GIT_PAGER=less', 'a GIT_ setting'],
    ['git -c core.hooksPath=/x commit', 'core.hooksPath'],
    ['git rebase --exec="git branch -f main HEAD" HEAD~1', 'git rebase --exec'],
    // a branch is a file in git's own folder: writing it there by a built path would move it
    ['echo abc > "$(git rev-parse --git-common-dir)/refs/heads/main"', "git's own folder"],
    // a backslash at a line's end joins the next line: the shell runs `git push`
    ['git \\\npush origin main', 'git push'],
    ['git commit -m x && git\\\n push', 'git push'],
    ['gi\\\nt push', 'git push'],
  ] as const)
    expect([c, gitWriteIn(c, 'worker')]).toEqual([c, what])
  // file names with git in them are no git call; a pipe or redirection ends git's words
  for (const c of ['cat hooks/core/git-guard.ts', 'ls .git', 'cat .gitignore', 'git merge main 2>&1 | tail -20', 'git log > /tmp/log', 'cd "$(git rev-parse --show-toplevel)"', 'tee -a "$LOG"', 'echo "use git"', 'git commit -m "make git handling simpler"'])
    expect([c, gitWriteIn(c, 'worker')]).toEqual([c, undefined])
})

test("T-1062: a worker's git writes run only in its own folder or /tmp", () => {
  const places = [WT, '/tmp']
  expect(gitPlaceOk('git commit -m x', WT, places)).toBe(true)
  expect(gitPlaceOk('git commit -m x', `${WT}/src`, places)).toBe(true)
  expect(gitPlaceOk('git commit -m x', '/private/tmp/x', places)).toBe(true)
  expect(gitPlaceOk('cd src && git add a', WT, places)).toBe(true)
  expect(gitPlaceOk(`cd ${WT} && git commit -m x`, ROOT, places)).toBe(true)
  expect(gitPlaceOk('cd /tmp/x && git commit -m x', WT, places)).toBe(true)
  // another repository on the disk, a shell folder elsewhere or unknown, a cd that can't be followed
  expect(gitPlaceOk('cd /Users/o/other && git commit -m x', WT, places)).toBe(false)
  expect(gitPlaceOk('git commit -m x', '/Users/o/other', places)).toBe(false)
  expect(gitPlaceOk('git commit -m x', undefined, places)).toBe(false)
  for (const c of ['cd \\\n/x && git commit', 'cd && git commit', 'cd - && git commit', 'cd ~ && git commit', 'cd $X && git commit', 'popd; git commit', 'pushd /x; git commit', 'true | chdir /x; git commit']) expect([c, gitPlaceOk(c, WT, places)]).toEqual([c, false])
  expect(shellCwd('/x')).toBe('/x')
  expect(shellCwd('x')).toBe(undefined)
  expect(shellCwd(undefined)).toBe(undefined)
})

test("T-1062: the shell path rule refuses the owner's folder in the text (any name) and '..', and lets the worker's own folder through", () => {
  const no = (c: string) => bashOutsideFolder(c, WT, ROOT, '/Users/o')
  expect(no(`cat ${ROOT}/README.md`)).toBe('README.md')
  expect(no(`echo x > "${ROOT}/a b"`)).toBe('a')
  expect(no(`cd ${ROOT} && rm x`)).toBe('')
  expect(no('cat ~/repo/README.md')).toBe('README.md')
  expect(no('cat $HOME/repo/.symcc/board.json')).toBe('.symcc/board.json')
  expect(no(`cat ${ROOT.toUpperCase()}/README.md`)).toBe('README.md')
  expect(no(`ls ${ROOT}/.symcc/worktrees/T-12`)).toBe('.symcc/worktrees/T-12')
  expect(no(`git diff --output=${ROOT}/a`)).toBe('a')
  // zsh runs a pipe's last command in the main shell, so `true | cd /owner; rm x` really moves: the path is in the text
  expect(no(`true | cd ${ROOT}; rm x`)).toBe('')
  expect(no(`true | chdir ${ROOT}; rm x`)).toBe('')
  // the same folder with extra `//`, `/./` or a line join in its path
  expect(no('cat /Users/o//repo/README.md')).toBe('README.md')
  expect(no('cd /Users/o/./repo && rm README.md')).toBe('')
  expect(no('cat /Users/o/.//./repo/./a')).toBe('a')
  expect(no('cat /Users/o/re\\\npo/a')).toBe('a')
  // '..' anywhere: "use full paths"
  for (const c of ['cd .. && ls', 'cat ../x', 'cat a/../../b', 'echo x > ../../README.md', 'make --prefix=../src', `bun -e "import('../x')"`, `cd ${WT}/src && cat ../a`]) expect([c, no(c)]).toEqual([c, BASH_DOTDOT])
  // a cd above the project, from where a relative path reaches it
  // (also behind option words: `cd -P /Users/o`, `cd -- /Users`)
  for (const c of ['cd / && echo x > Users/o/repo/README.md', 'cd && cat repo/README.md', 'cd ~ && ls', 'pushd /Users', 'true | cd /; rm x', 'chdir ~/', 'cd -P /Users/o && cat repo/README.md', 'cd -- /Users && cat o/repo/x', 'cd -L -P / && ls'])
    expect([c, no(c)]).toEqual([c, BASH_ABOVE])
  // the worker's own folder, other folders, ranges and plain commands
  for (const c of [`cat ${WT}/src/a.ts`, `cd ${WT} && git status`, 'cat ~/repo/.symcc/worktrees/T-1/a.ts', `ls ${ROOT}2/x /Users/o/repository`, 'echo x > /tmp/a', 'cd /tmp/x && ls', `cd ${WT}/src && ls`, 'cd src', 'git diff main..HEAD', 'git log main...HEAD', 'echo {1..3}', 'bun test', 'cd "$(git rev-parse --show-toplevel)"', 'tee -a "$LOG"'])
    expect([c, no(c)]).toEqual([c, undefined])
  // a project known by two names (as written and where a link leads), and macOS's /private/tmp
  expect(bashOutsideFolder('cat /Users/o/real/README.md', [WT], ['/Users/o/repo', '/Users/o/real'])).toBe('README.md')
  expect(bashOutsideFolder('cat /private/tmp/r/README.md', '/tmp/r/.symcc/worktrees/T-5', '/tmp/r')).toBe('README.md')
  expect(bashOutsideText(BASH_DOTDOT, WT)).toBe(`Refused: this command has a ".." path piece. Use full paths inside your own folder ${WT} instead.`)
})

test('T-1062: through checkEdit, a worker, a scout and a checker get their own reasons', async () => {
  const $ = setup()
  expect(await checkEdit($, 'w1', { command: 'git push' }, WT)).toBe(workerGitWriteText('git push'))
  // (a worker's commit, which needs its task on the board, is in merge.test.ts)
  expect(await checkEdit($, 'w1', { command: 'git log -3' }, WT)).toBeUndefined()
  expect(await checkEdit($, 'w1', { command: `cat ${ROOT}/README.md` }, WT)).toBe(bashOutsideText('README.md', WT))
  expect(await checkEdit($, 'w1', { command: 'cat ../x' }, WT)).toBe(bashOutsideText(BASH_DOTDOT, WT))
  expect(await checkEdit($, 'w1', { command: `cat ${WT}/a.ts` }, WT)).toBeUndefined()
  expect(await checkEdit($, 's1', { command: 'git commit -am x' }, ROOT)).toBe(scoutGitWriteText('git commit'))
  expect(await checkEdit($, 's1', { command: 'git log -3' }, ROOT)).toBeUndefined()
  expect(await checkEdit($, 'c1', { command: 'git commit -am x' }, WT)).toBe(gitWriteText('git commit'))
  expect(await checkEdit($, 'c1', { command: `cat ${ROOT}/README.md` }, WT)).toBe(bashOutsideText('README.md', WT))
  expect(await checkEdit($, 'c1', { command: 'git diff' }, WT)).toBeUndefined()
})
