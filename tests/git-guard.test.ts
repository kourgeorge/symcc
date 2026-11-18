// T-439: the git guard keeps main's broad rule (any word `git` counts) except in a read-only text tool's arguments
// (grep, rg, cat, ls...) and the words of a read-only git command, so "git" as search text or in a path no longer
// refuses a worker's or a scout's command; clearly read-only git (remote -v, config --get, reflog) passes too.
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
  // checker round 4: a shell-like word as a text tool's search term or path is only text
  'grep -rn "git" hooks | grep exec',
  "rg git -g '*.sh' --type sh",
  'grep -rn "git stash" docs/script',
  'grep -n "eval" hooks/core/ask.ts && grep -n git README.md',
  'git ls-files hooks',
  'git cat-file -p HEAD',
  'git describe --tags',
  'git show-ref --heads',
  'git worktree list',
  'git branch --list',
  'cat hooks/git-stash.md',
  'grep -c "git reset --hard" docs/guide.md && grep -n git README.md',
  'ls .git',
  'git reflog --date=iso',
  'watch -n 1 git status',
  'time -p git log -1',
  'echo git status | sh',
  'grep --regexp="git stash" docs',
  'grep -e "git stash" docs',
  'git log --grep="git stash"',
  'git ls-files | grep -n git',
  'grep -rn git hooks | sort | uniq | wc -l',
  '/usr/bin/grep -n git docs/guide.md',
  'find hooks -name "*git*"',
  'head -5 .gitignore && tail -n 3 .git/HEAD',
  'diff hooks/core/ask.ts hooks/git.ts',
  // round 6: a plain cd or pushd only changes folder
  'cd hooks && grep -n git ask.ts',
  'pushd docs && grep -rn "git stash" .',
  'cd && ls .git',
  'git reflog show HEAD -3 && cd hooks/core',
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
  ['git reflog -o /tmp/x', 'git reflog'],
  ['git reflog show -o /tmp/x', 'git reflog -o'],
  ['git cat-file --filters HEAD:a', 'git cat-file --filters'],
  ['git cat-file --filter HEAD:a', 'git cat-file --filter'],
  ['git worktree add /tmp/x', 'git worktree'],
  ['git branch x', 'git branch'],
  ["X='git stash;:' true", 'git stash'],
  ['echo -X"git reset --hard"', 'git reset'],
  // the checker's holes in try 1: reflog shows only with no subcommand or `show`
  ['git reflog write HEAD a b msg', 'git reflog'],
  ['git reflog exists HEAD', 'git reflog'],
  ['git reflog HEAD', 'git reflog'],
  // time and watch options are skipped before the command
  ['time -p git stash', 'git stash'],
  ['time git stash', 'git stash'],
  ['watch -n 1 git stash', 'git stash'],
  ['watch -d git stash', 'git stash'],
  ['watch -n1 -d -- git stash', 'git stash'],
  ['watch --interval 2 git stash', 'git stash'],
  // text piped into a shell, eval and source <(...) fall back to the broad rule
  ['echo git stash | sh', 'git stash'],
  ["printf 'git stash' | zsh", 'git stash'],
  ['echo git stash | sh -s', 'git stash'],
  ['echo "git stash" | bash', 'git stash'],
  ['echo git stash | xargs -I{} sh -c {}', 'git stash'],
  ['eval $(echo git stash)', 'git stash'],
  ['source <(echo git stash)', 'git stash'],
  ['. <(echo git stash)', 'git stash'],
  ['bash <(echo git stash)', 'git stash'],
  ['sh -c "$(echo git stash)"', 'git stash'],
  ['echo git stash | source /dev/stdin', 'git stash'],
  // the checker's try-3 holes: programs that run the command after them stay under main's broad rule
  ['script -q /dev/null git stash', 'git stash'],
  ['env -S "git stash"', 'git stash'],
  ['xcrun git stash', 'git stash'],
  ['busybox git stash', 'git stash'],
  ['busybox sh -c "git stash"', 'git stash'],
  ['npm exec git stash', 'git stash'],
  ['pnpm exec git stash', 'git stash'],
  ['uv run git stash', 'git stash'],
  ['direnv exec . git stash', 'git stash'],
  ['sandbox-exec -p x git stash', 'git stash'],
  ['unshare git stash', 'git stash'],
  ['watchexec -- git stash', 'git stash'],
  ['nix-shell --run "git stash"', 'git stash'],
  ['hyperfine "git stash"', 'git stash'],
  ['echo stash | xargs -I{} git {}', 'xargs git'],
  ['xargs -I {} git {}', 'xargs git'],
  ['echo stash | xargs -I % git %', 'xargs git'],
  // a text tool's output run by another program, a text tool's options that run a program, a look-alike script
  ['grep -h "git stash" notes | sh', 'git stash'],
  ['grep -h "git stash" notes | python3 -c "import os,sys; os.system(sys.stdin.read())"', 'git stash'],
  ['python3 -c $(grep -h "git stash" notes)', 'git stash'],
  ['git log --format="git stash" | sh', 'git stash'],
  ['eval grep git stash', 'git stash'],
  ['rg --pre git stash .', 'git stash'],
  ['rg --pre=git stash .', 'git stash'],
  ['ack --pager=git stash x', 'git stash'],
  ['ag --pager "git stash" x', 'git stash'],
  ['ack --pag="git stash" x', 'git stash'],
  ['less "+!git stash" notes', 'git stash'],
  ['find . -name x -exec git stash ;', 'git stash'],
  ['./grep git stash', 'git stash'],
  ['grep "$(git stash)" x', 'git stash'],
  ['grep x <(git stash)', 'git stash'],
  ['cat <<EOF\ngit stash\nEOF', 'git stash'],
  // the checker's try-5 holes: a shell in the line runs a text tool's output without a `|`
  ['coproc sh; grep -h "git stash" notes >&${COPROC[1]}', 'git stash'],
  ['mkfifo p; sh < p & grep -h "git stash" notes > p', 'git stash'],
  ['grep -h "git stash" notes > /tmp/s; sh /tmp/s', 'git stash'],
  ['grep -h "git stash" notes > s; . s', 'git stash'],
  ['grep -h "git stash" notes > s; exec bash s', 'git stash'],
  // checker round 4: `#` comments and `$'...'` quoting fool the command splitter, so no exception holds
  ["grep x #'\ngit stash", 'git stash'],
  ['cat x #"\ngit stash', 'git stash'],
  ["ls #'\ngit stash\n#'", 'git stash'],
  ["grep $'\\'' x; git stash; echo $'\\''", 'git stash'],
  ['grep -h git notes\ngit stash', 'git notes'],
  ['sudo sh s; grep -h "git stash" notes > s', 'git stash'],
  // checker round 5: any command that isn't a text tool or read-only git turns the exceptions off for the line
  ['grep -h "git stash" notes > s; $SHELL s', 'git stash'],
  ['grep -h "git stash" notes > s; $0 s', 'git stash'],
  ['grep -h "git stash" notes > s; /bin/s? s', 'git stash'],
  ['grep -h "git stash" notes > s; /bin/[s]h s', 'git stash'],
  ['grep -h "git stash" notes > s; tcsh s', 'git stash'],
  ['grep -h "git stash" notes > s; chmod +x s; ./s', 'git stash'],
  // round 6: `HEAD@{1}` doesn't cut the command, and a line with `@{` gets no read-only git exception
  ['git reflog show HEAD@{1} --output=/tmp/x', 'git reflog --output'],
  ['git reflog show HEAD@{1} -o /tmp/x', 'git reflog -o'],
  ['git log HEAD@{1} --output=/tmp/x', 'git log --output'],
  // round 6: rg --hostname-bin runs a program, and a word naming a git program keeps main's rule
  ['rg --hostname-bin=/Library/Developer/CommandLineTools/usr/libexec/git-core/git-stash x .', 'git stash'],
  ['rg --hostname-bin /usr/libexec/git-core/git-stash x .', 'git stash'],
  ['rg --hostname-bin=git stash .', 'git stash'],
  ['grep x /usr/libexec/git-core/git-stash', 'git stash'],
  // round 6: cd with anything but a plain path keeps main's rule
  ['cd "$(git stash)"', 'git stash'],
  ['cd $X && grep "git stash" y', 'git stash'],
  ['cd `git stash`', 'git stash'],
  ['cd -P x && grep "git stash" y', 'git stash'],
  ['cd x y && grep "git stash" y', 'git stash'],
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
