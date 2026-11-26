// T-1062: the slim worker guards. One git deny list (core/git-guard.ts) read as plain text, used by the hook guard
// and turned into the Node host's Claude Code rules; and one shell path rule (no owner's folder in the text, no `..`).
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { checkEdit } from '../hooks/app/ask'
import { gitWriteIn, gitPlaceOk, gitDeniedRules, gitAliases,gitWriteText, workerGitWriteText, scoutGitWriteText, bashOutsideFolder, bashOutsideText, BASH_DOTDOT, BASH_ABOVE, shellCwd } from '../hooks/board'
import { S, scoutRuns, workers, checkerRuns } from '../hooks/app/state'
import { fakeHost } from './fake-host'
import { ALLOWED, newGuardMisses, oldGitWriteIn, randomCommands } from './git-guard-compare'

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
  for (const c of ['cat hooks/core/git-guard.ts', 'ls .git', 'cat .gitignore', 'rm -rf /tmp/git-scratch', 'git merge main 2>&1 | tail -20', 'git log > /tmp/log', 'cd "$(git rev-parse --show-toplevel)"', 'tee -a "$LOG"', 'echo "use git"', 'git commit -F .scratch/msg', 'git --version', 'git help log'])
    expect([c, gitWriteIn(c, 'worker')]).toEqual([c, undefined])
  // "git" counts only where a command starts: not in a search pattern or a commit message
  for (const c of ['grep "git push" docs/', "echo 'git stash'", 'grep -c "git push" a', 'git log --grep "git push"'])
    for (const who of ['reader', 'worker'] as const) expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, undefined])
  expect(gitWriteIn('git commit -m "make git simpler"', 'worker')).toBe(undefined)
  expect(gitWriteIn('git commit -m "make git simpler"')).toBe('git commit')
  for (const [c, what] of [
    ['x && git push', 'git push'], ['ls || git stash', 'git stash'], ['true;git tag v', 'git tag'], ['ls | git stash', 'git stash'],
    ['(git push)', 'git push'], ['echo `git push`', 'git push'], ['ls\ngit push', 'git push'], ['env -i git push', 'git push'],
    ['sudo git push', 'git push'], ['command git push', 'git push'], ['exec git push', 'git push'], ['time git push', 'git push'],
    ['nohup git push', 'git push'], ['A=1 B=2 git push', 'git push'], ['if true; then git push; fi', 'git push'], ["bash -lc 'git push'", 'git push'],
  ] as const)
    expect([c, gitWriteIn(c, 'worker')]).toEqual([c, what])
  // after a leading redirect and after a case label's `)` a command starts too
  for (const c of ['2>/dev/null git push', '>/dev/null git push', '2> /dev/null git push', '&>/dev/null git push', '>&2 git push', 'x; 2>/dev/null git push', 'case x in x) git push;; esac'])
    for (const who of ['reader', 'worker'] as const) expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, 'git push'])
  // a redirect into a file named git runs no git
  expect(gitWriteIn('echo x > git push', 'worker')).toBe(undefined)
  expect(gitWriteIn('2>/dev/null git commit -m x', 'worker')).toBe(undefined)
})

test('T-1062: a quoted or backslashed git and git after a wrapper with options still count', () => {
  // the shell runs `"git" push`, `'git' push` and `\git push` (skips aliases) as plain git
  for (const c of ['"git" push', "'git' push", '\\git push', '"/usr/bin/git" push', 'env -u X git push', 'sudo -u root git push', 'timeout 5 git push', 'nice git push', 'nice -n 5 git push', "env -S 'git push'"])
    for (const who of ['reader', 'worker'] as const) expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, 'git push'])
  expect(gitWriteIn('"git" reset --hard')).toBe('git reset')
  // a search for the word git after a wrapper is no git call
  for (const c of ['find . | xargs grep -l git', 'time grep git x'])
    expect([c, gitWriteIn(c)]).toEqual([c, undefined])
})

test("T-1062: a worker's git init only makes a new repository under /tmp; readers keep git branch's listing words", () => {
  const node = gitDeniedRules(true)
  for (const c of ['git init /tmp/x', 'git init /private/tmp/a/b']) expect([c, gitWriteIn(c, 'worker')]).toEqual([c, undefined])
  // --separate-git-dir moves the owner's .git out of its copy; --template adds hooks; a plain init re-inits the folder it is in
  for (const c of ['git init --separate-git-dir=/tmp/zz', 'git init --separate-git-dir /tmp/zz /tmp/x', 'git init --template=/tmp/t /tmp/x', 'git init', 'git init .', `git init ${WT}`, 'git init /tmp/../Users/o/repo', 'git init-db /tmp/x']) {
    expect([c, typeof gitWriteIn(c, 'worker')]).toEqual([c, 'string'])
    expect([c, nodeRefuses(node, c)]).toEqual([c, true])
  }
  for (const c of ["git branch --list 'symcc/*'", 'git branch --contains HEAD', 'git branch --merged main', 'git branch --no-merged', 'git branch -a --sort=-committerdate', 'git branch -l symcc/T-1'])
    expect([c, gitWriteIn(c)]).toEqual([c, undefined])
  for (const c of ['git branch new', 'git branch -D x', 'git branch --list -m a b', 'git branch -f main HEAD', 'git branch --set-upstream-to=x'])
    expect([c, typeof gitWriteIn(c)]).toEqual([c, 'string'])
})

test('T-1062: an allow list: aliases, add-ons and unknown git names are refused for readers and workers', () => {
  for (const c of ['git co main', 'git p', 'git sw main', 'git unknownthing', 'git lfs push origin', 'git-receive-pack .'])
    for (const who of ['reader', 'worker'] as const) expect([c, who, typeof gitWriteIn(c, who)]).toEqual([c, who, 'string'])
  // the Node host can't deny "every name but these", so the owner's aliases (from git config) are denied by name
  expect(gitAliases('alias.co checkout\nalias.P push\nuser.name x\n')).toEqual(['co', 'p'])
  for (const worker of [true, false]) {
    const node = gitDeniedRules(worker, ['co', 'p', 'st', 'commit'])
    for (const c of ['git co main', 'git p', 'git st']) expect([c, worker, nodeRefuses(node, c)]).toEqual([c, worker, true])
    // an alias can't hide one of git's own names
    expect(nodeRefuses(node, 'git commit -m x')).toBe(!worker)
  }
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
  // the project path with a glob right after it
  for (const c of [`rm ${ROOT}*/README.md`, `cd ${ROOT}*`, `ls ${ROOT}?`, `ls ${ROOT}[x]`]) expect([c, no(c)]).toEqual([c, ''])
  expect(no(`ls ${WT}/src/*.ts`)).toBe(undefined)
  // '..' anywhere: "use full paths"
  for (const c of ['cd .. && ls', 'cat ../x', 'cat a/../../b', 'echo x > ../../README.md', 'echo hi >../README.md', 'echo x 2>../log', 'cat <../a', 'x>>../../a', 'make --prefix=../src', `bun -e "import('../x')"`, `cd ${WT}/src && cat ../a`]) expect([c, no(c)]).toEqual([c, BASH_DOTDOT])
  // a cd above the project, from where a relative path reaches it
  // (also behind option words: `cd -P /Users/o`, `cd -- /Users`)
  for (const c of ['cd / && echo x > Users/o/repo/README.md', 'cd && cat repo/README.md', 'cd ~ && ls', 'pushd /Users', 'true | cd /; rm x', 'chdir ~/', 'cd -P /Users/o && cat repo/README.md', 'cd -- /Users && cat o/repo/x', 'cd -L -P / && ls', 'cd $HOME && cat repo/README.md', 'cd "${HOME}" && ls repo', 'cd $HOME/ && rm repo/x', 'pushd ${HOME}'])
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

test("T-1062: a quoted or escaped '..', git after find -exec and other wrappers, and git grep -O are refused", () => {
  const no = (c: string) => bashOutsideFolder(c, WT, ROOT, '/Users/o')
  for (const c of ["cd .''. && rm README.md", 'cd \\.. && rm README.md', 'echo x > .\\./.\\./.\\./README.md', 'cat ".."/x']) expect([c, no(c)]).toEqual([c, BASH_DOTDOT])
  expect(no('git diff "main"..HEAD')).toBe(undefined)
  const node = (w: boolean) => gitDeniedRules(w)
  for (const who of ['reader', 'worker'] as const) {
    for (const [c, what] of [
      ['find . -exec git push origin HEAD:main \\;', 'git push'], ['find . -execdir git stash {} +', 'git stash'], ['find . -ok git tag v \\;', 'git tag'],
      ['caffeinate git push', 'git push'], ['watch -n1 git push', 'git push'], ['stdbuf -o0 git push', 'git push'],
      ['git grep -O"git push origin HEAD:main #" x', 'git grep -O'], ['git grep -niOless x', 'git grep -O'], ['git grep --open-files-in-pager=vi x', 'git grep -O'],
    ] as const)
      expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, what])
    for (const c of ['git grep -O"git push origin HEAD:main #" x', 'git grep --open=vi x', 'caffeinate git push', 'watch -n1 git push', 'stdbuf -o0 git push', 'find . -exec git push origin HEAD:main \\;'])
      expect([c, who, nodeRefuses(node(who === 'worker'), c)]).toEqual([c, who, true])
    for (const c of ['git grep -n foo', 'git grep -e a --or -e b', 'find . -name "*.ts" -exec cat {} +']) {
      expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, undefined])
      expect([c, who, nodeRefuses(node(who === 'worker'), c)]).toEqual([c, who, false])
    }
  }
})

test('T-1062: a redirect before the git command, a wrapper by its full path, ~user and a wildcard above the project are caught', () => {
  for (const who of ['reader', 'worker'] as const) {
    for (const [c, what] of [
      ['git 2>/dev/null push', 'git push'], ['git >/tmp/o push origin main', 'git push'], ['git --no-pager 2>&1 push', 'git push'], ['git &>/dev/null tag v', 'git tag'],
      ['/usr/bin/env git push', 'git push'], ['/usr/bin/sudo git push', 'git push'],
    ] as const) {
      expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, what])
      // (git after a program named by its full path is not seen on the Node host, accepted on purpose)
      if (c.startsWith('git ')) expect([c, who, nodeRefuses(gitDeniedRules(who === 'worker'), c)]).toEqual([c, who, true])
    }
    for (const c of ['git log 2>/dev/null', 'git status >/tmp/o', 'git diff 2>&1 | head']) expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, undefined])
  }
  const no = (c: string) => bashOutsideFolder(c, WT, ROOT, '/Users/o')
  expect(no('cat ~o/repo/README.md')).toBe('README.md')
  expect(no('cd ~o/ && cat repo/README.md')).toBe(BASH_ABOVE)
  for (const c of ['ls /Users/o/*/README.md', 'rm ~/re*/README.md', 'rm /Users/o/rep?/README.md', 'cat /Users/o/{repo,x}/README.md', 'rm -r /Users/o/r*', 'ls /U*/o/repo', 'cd /Users/*/repo'])
    expect([c, no(c)]).toEqual([c, ''])
  for (const c of ['ls /tmp/*', `ls ${WT}/*.ts`, 'ls /Users/o/repository', 'cat ~/notes/*.md', 'ls /Users/other/*', 'echo HEAD~2', 'git log main~1', 'cd ~+ && ls'])
    expect([c, no(c)]).toEqual([c, undefined])
})

test('T-1062: many option words after a wrapper still find the git call, fast', () => {
  const push = 'gi' + 't push origin main'
  for (const c of [
    'env' + ' -i'.repeat(40) + ' true; ' + push,
    'env' + ' -i'.repeat(40) + ' ' + push,
    'sudo' + ' -u root'.repeat(40) + ' ' + push,
    'nice' + ' -n 5'.repeat(40) + ' ' + push,
    'timeout' + ' 5'.repeat(40) + ' ' + push,
    'if' + ' -ab'.repeat(40) + ' ' + push,
    ('env -i ' + 'time -p ').repeat(30) + push,
    ('- ' + 'noglob -x ').repeat(30) + push,
  ]) {
    const start = Date.now()
    expect([c, gitWriteIn(c, 'worker'), gitWriteIn(c, 'reader')]).toEqual([c, 'git push', 'git push'])
    expect([c, Date.now() - start < 2500]).toEqual([c, true])
  }
})

test('T-1092: git after a lone `--` or a non-letter short option (`-0`, `-5`) is still seen', () => {
  for (const who of ['reader', 'worker'] as const) {
    for (const c of ['env -- git push', 'sudo -- git push', 'time -- git push', 'xargs -0 git push', 'nice -5 git push', 'xargs -0 -- git push', 'env -i -- git push', 'sudo -u root -- git push'])
      expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, 'git push'])
    expect([who, gitWriteIn('nohup -- git update-ref refs/heads/main HEAD', who)]).toEqual([who, 'git update-ref'])
  }
  // a worker may commit in its own folder; a reader may not
  expect(gitWriteIn('command -- git commit -m x', 'reader')).toBe('git commit')
  // still no git call where git is not a command's start
  for (const c of ['grep -- "git push" docs/', 'git log -- a.ts', 'echo -- git push'])
    expect([c, gitWriteIn(c, 'reader')]).toEqual([c, undefined])
})

test('T-1092: many `--` and `-0` words after a wrapper still find the git call, fast', () => {
  const push = 'gi' + 't push origin main'
  for (const c of [
    'env' + ' --'.repeat(40) + ' ' + push,
    'xargs' + ' -0'.repeat(40) + ' ' + push,
    'xargs' + ' -0 --'.repeat(40) + ' ' + push,
    'env' + ' --'.repeat(40) + ' true; ' + push,
    'xargs' + ' -0'.repeat(40) + ' x',
  ]) {
    const start = Date.now()
    const want = c.endsWith(' x') ? undefined : 'git push'
    expect([c, gitWriteIn(c, 'worker'), gitWriteIn(c, 'reader')]).toEqual([c, want, want])
    expect([c, Date.now() - start < 2500]).toEqual([c, true])
  }
})

test('T-1099: a wrapper word after a short option is never its value: repeated wrappers check fast', () => {
  for (const c of [('xargs -0 ').repeat(40) + 'x', ('xargs -n ').repeat(40) + 'x', ('sudo -u ').repeat(40) + 'x', ('env -- ').repeat(40) + 'x']) {
    const start = Date.now()
    expect([c, gitWriteIn(c, 'worker'), gitWriteIn(c, 'reader')]).toEqual([c, undefined, undefined])
    expect([c, Date.now() - start < 500]).toEqual([c, true])
  }
  const push = 'gi' + 't push'
  for (const c of [('xargs -n ').repeat(40) + push, ('xargs -0 ').repeat(40) + push, `xargs -n xargs -0 ${push}`, `sudo -u xargs ${push}`]) {
    const start = Date.now()
    expect([c, gitWriteIn(c, 'reader')]).toEqual([c, 'git push'])
    expect([c, Date.now() - start < 500]).toEqual([c, true])
  }
})

test('T-1099: grep after a no-value short option of xargs is a command, so a quoted git in its pattern is no git call', () => {
  for (const c of ['find . -print0 | xargs -0 grep "git push"', 'xargs -0 grep -c "git commit" docs/', 'xargs -r grep -l "git push"', 'xargs -t grep "git push" a', 'find . | xargs -0 -r grep -l "git stash"'])
    expect([c, gitWriteIn(c, 'reader')]).toEqual([c, undefined])
  // options that take a word still take it, so git after it is still found
  for (const who of ['reader', 'worker'] as const)
    for (const c of ['sudo -u root git push', 'env -u X git push', 'xargs -I {} git push', 'timeout -s KILL 5 git push', 'xargs -0 -I {} git push', 'xargs -r git push', 'xargs -0 sh -c "git push"', 'sudo -g staff -u root git push'])
      expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, 'git push'])
  // sudo's -R folder, -r role, -t type and -T timeout take a word too (xargs -r and -t take none)
  for (const who of ['reader', 'worker'] as const) {
    for (const c of ['sudo -R / git push', 'sudo -r role git push', 'sudo -t type git push', 'sudo -T 5 git push', '/usr/bin/sudo -R . git push', 'doas -r x git push', 'sudo -u root -R / git push'])
      expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, 'git push'])
  }
  expect(gitWriteIn('sudo -R . git commit -m x', 'reader')).toBe('git commit')
  for (const c of [('sudo -R ').repeat(40) + 'x', ('sudo -r ').repeat(40) + 'x']) {
    const start = Date.now()
    expect([c, gitWriteIn(c, 'reader')]).toEqual([c, undefined])
    expect([c, Date.now() - start < 500]).toEqual([c, true])
  }
})

test('T-1116: the command is split into words first: a redirect or setting among a wrapper\'s options is looked past', () => {
  for (const who of ['reader', 'worker'] as const)
    for (const c of [
      'sudo -u root>x git push', 'nice -n 2>x 5 git push', 'xargs -n >x 1 git push', 'env -u >x -i git push', 'sudo -u >x -i git push',
      'timeout -s >x KILL 5 git push', 'env -u A=1 -i git push', 'env -u A=1 B=2 -i git push', 'sudo -iu root git push', 'sudo --user root git push',
      'eval "git push"', "watch -n 1 'git push'", 'cat <(git push)', 'echo "a $(echo `git push`) b"', 'x # a comment\ngit push',
      "cat <<'EOF'\nit's here\nEOF\ngit push", 'cat <<EOF\ngit push\nEOF', 'find . -exec sh -c "git push" \\;', '{ git push; }', 'f() { git push; }',
      'echo ${X:-$(git push)}', 'GIT push', "$'git' push",
    ])
      expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, 'git push'])
  // a quoted git is a word, not a command; a comment runs nothing
  for (const c of ['xargs -0 grep "git push"', 'echo x # git push', 'echo "a; git push"', "printf '%s' 'x && git push'", 'cat <<EOF\nnot git push\nEOF'])
    expect([c, gitWriteIn(c, 'reader')]).toEqual([c, undefined])
})

test('T-1116: a word that runs a command is never a wrapper option\'s value; env -S text is read as env\'s own words', () => {
  for (const who of ['reader', 'worker'] as const)
    for (const c of [
      "env -i sh -c 'git push'", 'env -i bash -c "git push"', "sudo -i sh -c 'git push'", "sudo -i bash -c 'git push'", 'sudo -E bash -c "git push"',
      "xargs -i sh -c 'git push'", "nice -n sh -c 'git push'", "env -i eval 'git push'", "env -i watch 'git push'", "sudo -E watch 'git push'",
      "env -i fish -c 'git push'", 'sudo -u nice git push', "env -S'-i git push'", "env -S '-i git push'", "env --split-string='-i git push'",
      "env -iS '-u X git push'", "env -S 'A=1 sudo -u root git push'", "env -S 'true; git push'",
    ])
      expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, 'git push'])
  for (const c of ["env -S '-i grep git'", "env -i -S 'A=1' grep 'git push'"]) expect([c, gitWriteIn(c, 'reader')]).toEqual([c, undefined])
  // many env -S words can't make a check slow
  const c = "env -S '-i' ".repeat(3000) + 'gi' + 't push'
  const t = Date.now()
  expect(typeof gitWriteIn(c, 'reader')).toBe('string')
  expect(Date.now() - t < 1000).toBe(true)
})

test('T-1116: a shell word without -c is read both as an option value and as the command (`env -u sh git push`)', () => {
  for (const who of ['reader', 'worker'] as const)
    for (const c of [
      'env -u sh git push', 'env -u bash git push', 'sudo -u sh git push', 'sudo -g zsh git push', 'nice -n dash git push',
      'timeout -s ksh 5 git push', 'xargs -I sh git push', 'env -u fish git push', 'sh git push', 'bash git push', 'bash -l git push',
    ])
      expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, 'git push'])
  for (const c of ['bash script.sh push', "sh -c 'echo git push'", 'xargs -0 grep "git push"', 'sh git status'])
    expect([c, gitWriteIn(c, 'reader')]).toEqual([c, undefined])
  // many shell words can't make a check slow
  for (const r of ['sh ', 'env -u sh ', 'bash -l ']) {
    const c = r.repeat(40) + 'gi' + 't push'
    const t = Date.now()
    expect([c, gitWriteIn(c, 'reader')]).toEqual([c, 'git push'])
    expect([r, Date.now() - t < 100]).toEqual([r, true])
  }
  const t = Date.now()
  expect(typeof gitWriteIn('sh '.repeat(5000) + 'gi' + 't push', 'reader')).toBe('string')
  expect(Date.now() - t < 1000).toBe(true)
})

test('T-1116: a wrapper option\'s value never starts with "-"; such a word is the next option (`sudo -i -u root git push`)', () => {
  for (const who of ['reader', 'worker'] as const)
    for (const c of [
      'sudo -i -u root git push', 'sudo -E -u root git push', 'sudo -H -u root git push', 'sudo -s -u root git push',
      'sudo -k -u root git push', 'sudo -n -u root git push', 'env -i -u X git push', 'env -i -C /tmp git push',
      'sudo -u root -i -u bob git push', "env -S '-i git push'", "env -S'-i git push'",
    ])
      expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, 'git push'])
})

test('T-1116: repeated wrappers, redirects and a long random command check fast', () => {
  const push = 'gi' + 't push'
  for (const r of ['xargs -0 ', 'env -i A=1 ', 'nice >x - ', '<x - ', '- 5 >x ', 'env -i >x - ', 'sudo -u a -s ', 'timeout -s >x KILL 5 ']) {
    const c = r.repeat(40) + push
    const start = Date.now()
    expect([c, gitWriteIn(c, 'reader'), gitWriteIn(c, 'worker')]).toEqual([c, 'git push', 'git push'])
    expect([r, Date.now() - start < 100]).toEqual([r, true])
  }
  // a random 20,000-character command (a fixed seed, so every run is the same)
  const parts = ['git', ' ', 'push', '-u', '>', '<', '2>', '&', '|', ';', '"', "'", '\\', '$(', ')', '`', 'env', 'sudo', 'x', '=', '-', '\n', '{', '}', '#', 'eval', 'sh -c ', '<<', 'EOF']
  let seed = 7
  let big = ''
  while (big.length < 20_000) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    big += parts[seed % parts.length]
  }
  const start = Date.now()
  gitWriteIn(big, 'reader')
  gitWriteIn(big, 'worker')
  expect(Date.now() - start < 200).toBe(true)
  // eval inside eval can't make a check slow: past a limit the command is refused
  const evals = 'nice eval '.repeat(2000) + 'true'
  const t = Date.now()
  expect(gitWriteIn(evals, 'reader')).toBe('a command too complex to read')
  expect(Date.now() - t < 1000).toBe(true)
  expect(gitWriteIn('$('.repeat(20_000), 'reader')).toBe('a command too complex to read')
})

test('T-1116: a command substitution glued to the command word counts as empty (`$(true)git push` runs git push)', () => {
  const glued = ['$(true)git push', '`true`git push', '``git push', '$()git push', '"$(true)"git push', '""$(:)git push', 'sudo $(true)git push',
    'x=1 $(true)git push', '/usr/bin/$(true)git push', '<(true)git push', '$(true) git push', '`true` git push', 'nice $(true) git push']
  for (const who of ['reader', 'worker'] as const)
    for (const c of glued) expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, 'git push'])
  // a `}` inside a word ends no command; `{ ...; }` still does
  expect(gitWriteIn('echo }git push', 'reader')).toBe(undefined)
  expect(gitWriteIn('{ git push; }', 'reader')).toBe('git push')
  expect(gitWriteIn('x;}git push', 'reader')).toBe(undefined)
  expect(gitWriteIn('{ true;}; git push', 'reader')).toBe('git push')
})

test('T-1138: a git command word built by the shell ($(...), `...`, $X, ${X}) is refused for readers and workers', () => {
  const built = ['git $(echo push)', 'git ${A} push', 'git $X', 'git `echo stash`', 'git "$(echo reset)" --hard', 'git -P $(echo push)',
    'git "$X"', 'git x$X', 'sudo git $(echo push)', 'find . -exec git $X ;', "sh -c 'git $(echo push)'", 'eval git \\$X', 'git $1',
    'env -S "git $X"', 'env -u sh git $X', 'x; git `echo push` origin', 'git $(echo -C) /x push']
  for (const who of ['reader', 'worker'] as const) {
    for (const c of built) expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, 'a git command built by the shell'])
    // reads, quoted dollars, words after the command, and plain non-names keep today's rule
    for (const c of ['git status', "git log --format='$x'", 'git log --format="%H $(echo x)"', "git '$x'", 'git log $X', 'git a.ts', "git $'status'", 'git show "$REV"'])
      expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, undefined])
  }
  expect(gitWriteIn('git commit -m "$MSG"', 'worker')).toBe(undefined)
  expect(gitWriteIn('git push $X', 'worker')).toBe('git push')
})

test('T-1128: a { or } right after a redirect is its file name, not a command break (`git >} push` runs git push)', () => {
  for (const who of ['reader', 'worker'] as const) {
    for (const c of ['git >} push', 'git > } push', 'git 2> { push', 'git -P >} push', 'git <{ push', 'git >{ push'])
      expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, 'git push'])
    expect([who, gitWriteIn('git >} commit', who)]).toEqual([who, who === 'reader' ? 'git commit' : undefined])
    // braces that start or end a group still break commands
    expect([who, gitWriteIn('{ git push; }', who)]).toEqual([who, 'git push'])
    expect([who, gitWriteIn('{ echo >x; } ; git push', who)]).toEqual([who, 'git push'])
  }
})

test("T-1062: zsh's noglob, nocorrect, coproc and `-` before git, ~- and the folder stack, and a project path glued to an option are caught", () => {
  for (const who of ['reader', 'worker'] as const) {
    for (const c of ['noglob git push', 'nocorrect git push', '- git push', 'coproc git push', 'builtin git push', 'repeat 2 git push', 'x; noglob nocorrect git push'])
      expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, 'git push'])
    for (const c of ['noglob git push', 'nocorrect git push', '- git push', 'coproc git push'])
      expect([c, who, nodeRefuses(gitDeniedRules(who === 'worker'), c)]).toEqual([c, who, true])
    expect([who, gitWriteIn('noglob git log -3', who)]).toEqual([who, undefined])
  }
  const no = (c: string) => bashOutsideFolder(c, WT, ROOT, '/Users/o')
  // the previous folder (`~-`, like `cd -`) and zsh's folder stack may be the owner's copy
  for (const c of ['rm ~-/README.md', 'cd ~- && rm README.md', 'cat ~-', 'cd $OLDPWD && rm x', 'rm ${OLDPWD}/x', 'cd ~1 && rm x', 'ls ~-2/x', 'cd +1 && rm x', 'pushd -1'])
    expect([c, no(c)]).toEqual([c, BASH_ABOVE])
  expect(bashOutsideFolder('rm ~-/README.md', WT, ROOT)).toBe(BASH_ABOVE)
  // the project path glued to an option still counts
  for (const [c, rel] of [[`sort -o${ROOT}/README.md x`, 'README.md'], [`curl -o${ROOT}/a https://example.com`, 'a'], [`tar -xf a.tar -C${ROOT}`, ''], ['ls -d/Users/o/*/README.md', '']] as const)
    expect([c, no(c)]).toEqual([c, rel])
  for (const c of [`sort -o${WT}/a x`, `tar -xf a.tar -C${WT}/src`]) expect([c, no(c)]).toEqual([c, undefined])
})

test('T-1116: a `--` right after eval ends its options; a quoted value after a watch option counts by its first word', () => {
  for (const who of ['reader', 'worker'] as const)
    for (const c of ['eval -- git push', 'eval -- "git push"', 'sudo eval -- git push', "watch -c 'git push'", "watch -n 'git push'", "watch -lc 'git push'", "sudo watch -g 'git push'"])
      expect([c, who, gitWriteIn(c, who)]).toEqual([c, who, 'git push'])
  expect(gitWriteIn('x; eval -- git commit -m y', 'reader')).toBe('git commit')
  // a sudo or env value is one word: a user named "git push" runs no git
  expect(gitWriteIn("sudo -u 'git push' true", 'reader')).toBe(undefined)
})

/** Every case the checkers sent back (T-1114 and each T-1116 try), for the comparison with main's old guard. */
const CHECKER_CASES = [
  'sudo -u root>x git push', 'nice -n 2>x 5 git push', 'xargs -n >x 1 git push', 'env -u >x -i git push', 'sudo -u >x -i git push',
  'timeout -s >x KILL 5 git push', 'env -u A=1 -i git push', '$(true)git push', '`true`git push', 'sudo $(true)git push',
  "env -i sh -c 'git push'", 'env -i bash -c "git push"', "sudo -i sh -c 'git push'", 'sudo -E bash -c "git push"', "xargs -i sh -c 'git push'",
  "nice -n sh -c 'git push'", "env -i eval 'git push'", "env -i watch 'git push'", "sudo -E watch 'git push'", "env -S'-i git push'", "env -S '-i git push'",
  'env -u sh git push', 'sudo -u sh git push', 'sudo -g zsh git push', 'nice -n dash git push', 'timeout -s ksh 5 git push', 'xargs -I sh git push',
  'env -u fish git push', 'sh git push', 'bash git push', 'sudo -i -u root git push', 'sudo -E -u root git push', 'sudo -H -u root git push',
  'sudo -s -u root git push', 'sudo -k -u root git push', 'sudo -n -u root git push', 'env -i -u X git push', 'env -i -C /tmp git push',
  'sudo -u root -i -u bob git push', 'eval -- git push', 'eval -- "git push"', 'sudo eval -- git push', 'x; eval -- git commit -m y',
  'nice -n -5 git push', 'timeout -s -9 5 git push', 'sudo -u -- git push', 'env -u - git push', "watch -c 'git push'",
]

test("T-1116: the new guard refuses everything main's old regex guard refused, but for a named list of shapes that run no git", () => {
  for (const who of ['reader', 'worker'] as const) {
    // the checkers' cases: no exception at all
    for (const c of CHECKER_CASES)
      if (oldGitWriteIn(c, who) !== undefined) expect([c, who, typeof gitWriteIn(c, who)]).toEqual([c, who, 'string'])
    // 20,000 random wrapper, option, shell, redirect and quote mixes (a fixed seed)
    const { misses, used } = newGuardMisses(randomCommands(20_000), who)
    expect([who, misses.slice(0, 5)]).toEqual([who, []])
    // every allowed shape comes up, so none is dead weight
    for (const [name] of ALLOWED) expect([who, name, (used[name] ?? 0) > 0]).toEqual([who, name, true])
  }
  // the allowed shapes: the old guard refused these, the new one lets them through, and none runs git
  for (const c of ['echo &>x git push', "'$(git push)'", 'env -Si git push', 'find bash git push', 'nice root watch bash git push', 'eval -E git push', "'git push' x", 'bash -c git push', 'time "-u" > git commit', 'bash - -i -k KILL git push'])
    expect([c, typeof oldGitWriteIn(c, 'reader'), gitWriteIn(c, 'reader')]).toEqual([c, 'string', undefined])
})
