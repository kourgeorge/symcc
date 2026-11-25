// T-439: the git guard keeps main's broad rule (any word `git` counts) except in a read-only text tool's arguments
// (grep, rg, cat, ls...) and the words of a read-only git command, so "git" as search text or in a path no longer
// refuses a worker's or a scout's command; clearly read-only git (remote -v, config --get, reflog) passes too.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { checkEdit } from '../hooks/app/ask'
import { gitWriteIn, gitWriteText, workerGitWriteText, scoutGitWriteText, bashOutsideText, BASH_UNRESOLVED, unresolvedTarget } from '../hooks/board'
import { S, scoutRuns, workers, checkerRuns } from '../hooks/app/state'
import { fakeHost } from './fake-host'
import { workerGitAllow } from '../hooks/core/git-guard'
import { bashOutsideFolder } from '../hooks/core/path-guard'
import { bestPairMsOf, growsSlowly } from './timing'

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
  // T-436: a range that spells no git is no git
  'echo {1..3}',
  'echo {a..f}it',
  // T-436: a range too big to spell out, of numbers only, can never spell git
  'echo {1..2000}',
  'touch f{1..1100}.txt',
  'mkdir -p d{0..9}{0..9}{0..9}{0..9}',
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
  // T-446: `@{` revisions and an empty `{}` are no brace expansion
  'git log HEAD@{1}',
  'git log -1 HEAD@{u}',
  // T-446: braces inside quotes and `${VAR}` are no brace expansion
  `git log --pretty=format:'{"h":"%h"}'`,
  'git -C "${PWD}" log',
  'git log ${x}',
  'find . -name x -exec git log -1 {} +',
  '{ grep -n git README.md; }',
  // T-446: after find -exec the command run is the word right after it; grep's search word `git` is only text
  'find . -exec grep -l git {} +',
  'find . -name x -exec grep -n git {} \\;',
  'find . -type f -exec grep -l "git" {} +',
  // T-485: a backslash inside quotes is plain text to bash (grep's `\|`), so the text-tool exception holds
  'grep -rn "git init\\|x" hooks',
  'grep -rn "a\\|git init" hooks',
  `grep -rn "git init\\|'init'" hooks/core/ask.ts`,
  "grep -rn 'git stash\\|x' hooks",
  'rg "git (init|stash)\\.\\w+" hooks | head -5',
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
  // (T-963: `>&${COPROC[1]}` is now refused first by the path guard, as a write target built from a variable)
  ['coproc sh; grep -h "git stash" notes >&3', 'git stash'],
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
  // round 7: a backslash turns the exceptions off (`a\>&` is a plain word then a background `&`)
  ['grep x a\\>& git stash', 'git stash'],
  ['grep x a\\<& git stash', 'git stash'],
  ['cat x\\>& git stash', 'git stash'],
  // T-485: a backslash outside quotes still turns the exceptions off, also next to a quoted one, or in an unclosed quote
  ['grep x a \\| git init', 'git init'],
  ['grep "x" a; git init', 'git init'],
  ['grep "a\\|b" x\\>& git stash', 'git stash'],
  ["grep 'a\\|b' x\\>& git stash", 'git stash'],
  ['grep "a\\|b" x | git init', 'git init'],
  ['grep "a\\|b" x && git init', 'git init'],
  ['grep "a\\|b" "$(git stash)"', 'git stash'],
  ['grep "a\\|b" `git stash`', 'git stash'],
  ['grep "a\\\\" x\\>& git stash', 'git stash'],
  ['grep "a\\"b" x\\>& git stash', 'git stash'],
  ['grep x\\>& git stash "a\\|b', 'git stash'],
  // a backslash inside "..." that escapes there (`\$`, `\"`, `\\`) still counts, on the safe side
  ['grep -E "a\\$|git init" x', 'git init'],
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
  // (T-963: `cd $X`, `cd "$(...)"` and cd with backticks are now refused first by the path guard, as cd targets built
  // at run time, so those use other words here)
  ['ls "$(git stash)"', 'git stash'],
  ['cd a* && grep "git stash" y', 'git stash'],
  ['ls `git stash`', 'git stash'],
  ['cd -P x && grep "git stash" y', 'git stash'],
  ['cd x y && grep "git stash" y', 'git stash'],
  // T-446: brace expansion makes new words (`git {stash,}` runs `git stash`), so a "{" inside a word never cuts the
  // command, and a git command with a "{" in its words (outside `@{` and an empty `{}`) is refused
  ['git {stash,}', 'git with {braces}'],
  ['git {push,origin}', 'git with {braces}'],
  ['git {commit,-m,x}', 'git with {braces}'],
  ['git -C {.,} stash', 'git with {braces}'],
  ['git log {--output=/tmp/x,}', 'git with {braces}'],
  ['{git,} stash', 'git with {braces}'],
  ['g{i,}t stash', 'git with {braces}'],
  ['rg --pre={git,} stash .', 'git with {braces}'],
  // one braced word may hold git and its subcommand together (`{git,stash}` runs `git stash`)
  ['{git,stash}', 'git with {braces}'],
  ['{git,-C,.,stash}', 'git with {braces}'],
  ['{/usr/bin/git,stash}', 'git with {braces}'],
  ['env {git,stash}', 'git with {braces}'],
  ['{git-stash,}', 'git with {braces}'],
  // text a shell runs again is a command of its own, braces and all
  ["bash -c '{git,stash}'", 'git with {braces}'],
  ['sh -c "{git,stash}"', 'git with {braces}'],
  ["eval '{git,stash}'", 'git with {braces}'],
  ['bash -c "{,git} stash"', 'git with {braces}'],
  ["bash -c 'echo; {git,stash}'", 'git with {braces}'],
  ["bash -c 'cd x && {git,stash}'", 'git with {braces}'],
  // T-436: a letter range spells git too (`g{i..i}t` is `git`, `{g..h}it` is `git hit`)
  ['g{i..i}t stash', 'git with {braces}'],
  ['{g..g}it push origin main', 'git with {braces}'],
  ['gi{t..t} reset --hard', 'git with {braces}'],
  ['bash -c "g{i..i}t stash"', 'git with {braces}'],
  ['{g..h}it stash', 'git with {braces}'],
  ['{f,{g..g}}it stash', 'git with {braces}'],
  // too big to spell out, but its letters and letter ranges could still make git
  ['{a..z}{a..z}{a..z} stash', 'git with {braces}'],
  ['{1..2000}g{h..j}t stash', 'git with {braces}'],
  ['git log "x" {a,b}', 'git with {braces}'],
  ['find . -maxdepth 0 -exec git -C {} stash +', 'git stash'],
  ['find . -exec git stash {} +', 'git stash'],
  ['find . -exec grep -l git {} \\; -exec git stash \\;', 'git stash'],
  ['find . -exec env git stash {} +', 'git stash'],
  ['{ git stash; }', 'git stash'],
  ['{ git stash; } && echo', 'git stash'],
  ['echo x && { git push; }', 'git push'],
  ['if true; then { git stash; }; fi', 'git stash'],
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

/**
 * What a worker in WT is told for `command` when the git guard gives `want`: a command line run by eval or `sh -c` with
 * a `$` in it is refused first by the path guard, as it may write anywhere (T-963); both refuse it. A checker's git
 * check comes first.
 */
const firstRefusal = (command: string, want: string) => {
  const word = unresolvedTarget(command)
  return word === undefined ? want : bashOutsideText(BASH_UNRESOLVED + word, WT)
}

test('git run as a command still refuses its writes, for a worker, a scout and a checker (T-439)', async () => {
  const $ = setup()
  for (const [command, what] of WRITES) {
    expect([command, gitWriteIn(command)]).toEqual([command, what])
    expect(await checkEdit($, 'w1', { command }, WT)).toBe(firstRefusal(command, workerGitWriteText(what)))
    expect(await checkEdit($, 's1', { command }, ROOT)).toBe(scoutGitWriteText(what))
    expect(await checkEdit($, 'c1', { command }, WT)).toBe(gitWriteText(what))
  }
})

test('long odd brace words stay cheap for the git check, and a long word with git letters still counts (T-436)', () => {
  const words = (n: number) => () => {
    expect(gitWriteIn('echo ' + '{'.repeat(1000 * n))).toBeUndefined()
    expect(gitWriteIn('echo ' + '{a,'.repeat(n) + '}'.repeat(n))).toBeUndefined()
    expect(gitWriteIn(`cat > a.json <<'EOF'\n${'{"a":'.repeat(40 * n)}1${'}'.repeat(40 * n)}\nEOF`)).toBeUndefined()
  }
  // the work grows slowly with the word length, with a generous cap (T-478): doubling per brace would make 2^50 steps
  // for the big case and 2^25 for the small one. A long run of "{" costs about the square of its length (twice as long,
  // about 4 times the time), so twice the length may take up to 10 times as long
  const { small, big } = bestPairMsOf(words(25), words(50))
  expect({ small, big, slow: growsSlowly(small, big, 10) }).toMatchObject({ slow: true })
  expect(gitWriteIn('echo ' + '{a,'.repeat(60) + '}'.repeat(60))).toBeUndefined()
  // past the work cap a word is judged by its letters: these could make git
  expect(gitWriteIn(`${'{g,i}'.repeat(60)}{t..t} stash`)).toBe('git with {braces}')
})

test('a brace word past the length or "{" limit is not expanded: it is judged by its letters, so the limit stays (T-436, T-478)', () => {
  // `t{i,g}` expands to "ti" and "tg", never git, but its letters hold g, i and t. Under the limits the expansion is
  // used, so it is no git; past them (more than 50 "{", or more than 2000 characters) the expansion is skipped and
  // the letters count, so it is refused. Without the limit this word would be expanded and pass
  expect(gitWriteIn(`t{i,g}${'{x}'.repeat(49)} stash`)).toBeUndefined()
  expect(gitWriteIn(`t{i,g}${'{x}'.repeat(50)} stash`)).toBe('git with {braces}')
  expect(gitWriteIn(`t{i,g}${'x'.repeat(1990)} stash`)).toBeUndefined()
  expect(gitWriteIn(`t{i,g}${'x'.repeat(2000)} stash`)).toBe('git with {braces}')
})

test('the git write reasons keep their exact text, and quoted braces stay text (T-447)', () => {
  const head = (who: string) =>
    `Refused: git stash may change the repository or run another program, and ${who} may only read with git (diff, log, show, status, blame, grep, rev-parse, ls-files, branch --list, stash list/show, remote -v, config --get, reflog), without options that write a file or run a program (--output, -O, --ext-diff, -c, GIT_* settings).`
  const tmp = 'A scratch repository under /tmp with a plain path is fine (e.g. git init /tmp/x, git -C /tmp/x commit -m m); no $TMPDIR, $(mktemp), ~ or ..'
  expect(gitWriteText('git stash')).toBe(`${head('the checker')} Check the work without changing any branch, commit, tag or the stash. ${tmp}`)
  // T-1053: a worker may change git in its own folder, on its own branch; the reason says what stays refused
  expect(workerGitWriteText('git push')).toBe(`Refused: git push may change more than your own branch. In your own folder you may change git on your own branch (commit, merge, cherry-pick, revert, restore, checkout -- <file>, reset, rebase of your branch, bisect, add, rm). Not allowed: push, fetch, pull or changing remotes; switching to, making or deleting a branch (checkout or switch to a branch, branch -d/-D/-m); worktree; config; tag; stash (it is shared with the owner's folder); a git command in another folder, through a $variable, or with -c or GIT_* settings. ${tmp}`)
  expect(scoutGitWriteText('git stash')).toBe(`${head('a scout')} You run in the owner's own folder: don't commit, push, merge, reset, switch branches, stash or move any branch or tag. Report what you find instead.`)
  // quoted or backslashed braces are text; bare ones may spell git; an inner bash -c or a word holding a command is folded in
  expect(gitWriteIn(`git log --format='{"h":"%h"}'`)).toBeUndefined()
  expect(gitWriteIn(`git log --format=\\{x\\,y\\}`)).toBeUndefined()
  expect(gitWriteIn('{git,} stash')).toBe('git with {braces}')
  expect(gitWriteIn(`bash -c 'git stash'`)).toBe('git stash')
  expect(gitWriteIn(`X='ls; git stash'`)).toBe('git stash')
})

test('braces in paths after `--` of a read-only git, and in echo, printf or `x=` text, are no git command (T-450)', async () => {
  const $ = setup()
  for (const command of ['git diff -- hooks/{a,b}.ts', 'git log -- {a,b}.ts', 'echo {git,stash}', "printf '%s\\n' {git,stash}", 'x={git,stash}', 'echo {git,} stash | grep x']) {
    expect([command, gitWriteIn(command)]).toEqual([command, undefined])
    expect(await checkEdit($, 'w1', { command }, WT)).toBeUndefined()
    expect(await checkEdit($, 's1', { command }, ROOT)).toBeUndefined()
    expect(await checkEdit($, 'c1', { command }, WT)).toBeUndefined()
  }
  // braces among git's own words, after `--` of a writing command, words that may be options, and printed or set
  // text that another command may run again stay refused
  for (const command of [
    'git log "x" {a,b}',
    'git -- {stash,}',
    'git diff {--,} {a,b}',
    'git stash -- {a,b}',
    'git log --grep -- {--output=/tmp/x,}',
    'echo {git,stash} | sh',
    'echo {git,stash} > s',
    "printf '%s\\n' {git,stash} | sh",
    'x={git,stash}; eval $x',
    'x={git,stash}; bash -c "$x"',
    'x=a {git,stash}',
    '/tmp/echo {git,stash}',
    // zsh makes a range of any two characters ({*../} gives * + , - . /), so a range or a "-" part is never let through
    'git grep -e -- {*../}Otouch',
    'git grep -e -- {*../}-open-files-in-pager=touch',
    'git log -S -- {*../}-output=/tmp/x',
    'git diff -- {a..c}.ts',
    'git diff -- {a,-x}.ts',
    'echo {*..h}it stash',
    'x={f..h}it',
    'echo {-n,git} stash',
  ]) {
    expect([command, gitWriteIn(command)]).toEqual([command, 'git with {braces}'])
    expect(await checkEdit($, 'w1', { command }, WT)).toBe(firstRefusal(command, workerGitWriteText('git with {braces}')))
    expect(await checkEdit($, 's1', { command }, ROOT)).toBe(scoutGitWriteText('git with {braces}'))
    expect(await checkEdit($, 'c1', { command }, WT)).toBe(gitWriteText('git with {braces}'))
  }
})

test("T-1053: zsh's chdir is a folder change like cd, for the git guard and the path guard (checker, try 10)", () => {
  const own = '/Users/u/p/.symcc/worktrees/T-9'
  for (const verb of ['cd', 'chdir']) {
    for (const command of [`${verb} \${PWD%/.symcc*} && git commit -am x`, `true | ${verb} \${PWD%/.symcc*}; git commit -am x`]) {
      expect([command, typeof gitWriteIn(command, workerGitAllow([own]), own)]).toEqual([command, 'string'])
      expect([command, typeof bashOutsideFolder(command, [own], ['/Users/u/p'], '/Users/u', own)]).toEqual([command, 'string'])
    }
    // a plain one inside its own folder is still fine
    expect(gitWriteIn(`${verb} ${own}/src && git commit -am x`, workerGitAllow([own]), own)).toBe(undefined)
  }
})
