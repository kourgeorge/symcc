// T-963: a write or cd target built from a shell variable or command output ($X, ${X}, $(...), backticks) can't be
// checked, so a worker's or checker's command with one is refused; variables anywhere else still pass, and the lead
// is not checked. The guard is shared by every host (Claude Code, OpenCode, Copilot) through checkEdit.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { checkEdit } from '../hooks/app/ask'
import { bashOutsideFolder, bashOutsideText, BASH_UNRESOLVED, unresolvedTarget } from '../hooks/board'
import { S, workers, checkerRuns } from '../hooks/app/state'
import { fakeHost } from './fake-host'

const ROOT = '/repo'
const WT = `${ROOT}/.symcc/worktrees/T-1`
const no = (c: string) => bashOutsideFolder(c, WT, ROOT, '/home/me', WT)

/** Commands whose write or cd target is built at run time, and the word that is refused. */
const REFUSED: [string, string][] = [
  ['X=/rep; echo x > "$X"o/README.md', '"$X"o/README.md'],
  ['echo x > "$X"o/README.md', '"$X"o/README.md'],
  ['echo x > $HOME/f', '$HOME/f'],
  ['echo x >$HOME/f', '$HOME/f'],
  ['echo x >> ${D}/f', '${D}/f'],
  ['echo x 2> $F', '$F'],
  ['echo x &> $F', '$F'],
  ['cp a ${D}/b', '${D}/b'],
  ['cp -t "$D" a', '"$D"'],
  ['echo x > $(pwd)/../../f', '$(pwd)/../../f'],
  ['echo x > `pwd`/../../f', '`pwd`/../../f'],
  ['cd $X', '$X'],
  ['cd "${X}" && ls', '"${X}"'],
  ['pushd $(dirname x)', '$(dirname x)'],
  ['echo x | tee -a "$LOG"', '"$LOG"'],
  ['mv a $B', '$B'],
  ['rm -rf $TMPDIR/x', '$TMPDIR/x'],
  ['touch ${HOME}/x', '${HOME}/x'],
  ["sed -i '' s/a/b/ $F", '$F'],
  ['sed -i s/a/b/ "$F"', '"$F"'],
  ['dd if=/dev/zero of=$F', 'of=$F'],
  // a command inside $(...) or backticks is checked too
  ['echo "$(echo hi > $Y)"', '$Y'],
  ['x=`cp a $D`', '$D'],
  // the checker's probes: an unquoted here-document runs its $(...) and backticks
  ['X=/rep; cat <<EOF\n$(echo x > "$X"o/README.md)\nEOF', '$(echo x > "$X"o/README.md)'],
  ['cat <<-EOF\n\t`echo x > "$X"o/f`\n\tEOF', '`echo x > "$X"o/f`'],
  // a command line given to eval or a shell, with a $ or backtick in it
  [`X=/rep; eval 'echo x > "$X"o/README.md'`, `'echo x > "$X"o/README.md'`],
  [`X=/rep; sh -c 'echo x > "$X"o/README.md'`, `'echo x > "$X"o/README.md'`],
  [`bash -lc 'cd $X'`, `'cd $X'`],
  [`env -S 'cp a $D'`, `'cp a $D'`],
  [`echo 'cd $X' | sh`, `$X'`],
  // a runner's option values are skipped to find the command
  ['sudo -u me cp a $D', '$D'],
  ['env -u X cp a $D', '$D'],
  ['nice -n 5 cp a $D', '$D'],
  ['timeout -s KILL 10 cp a $D', '$D'],
  ['xargs -I {} cp {} $D', '$D'],
  ['time -o $F ls', '$F'],
  // a command named by a variable, given a variable; find's -exec command
  ['$CMD "$X"o/f', '$CMD'],
  ['find . -exec cp {} $D \\;', '$D'],
  // the checker's third-try probes: `-c --`, a runner's folder option, source and trap
  [`X=/rep; bash -c -- 'cp a $X'`, `'cp a $X'`],
  [`sh -c -- "cp a $X"`, `"cp a $X"`],
  [`bash -c -e 'cp a $X'`, `'cp a $X'`],
  [`bash -o posix -c -- 'cp a $X'`, `'cp a $X'`],
  [`X=/rep; env -C "$X"o touch README.md`, `"$X"o`],
  ['env --chdir=$X touch f', '--chdir=$X'],
  ['env --chdir $X touch f', '$X'],
  ['env -iC $X touch f', '$X'],
  ['env -C$X touch f', '-C$X'],
  ['sudo -D $X touch f', '$X'],
  ['sudo --chdir=$X touch f', '--chdir=$X'],
  [`X=/rep; source <(echo "cp a $X")`, `<(echo "cp a $X")`],
  [`. <(echo "cp a $X")`, `<(echo "cp a $X")`],
  [`. /dev/stdin <<< "cp a $X"`, '/dev/stdin'],
  ['source $F', '$F'],
  [`X=/rep; trap 'cp a $X' EXIT`, `'cp a $X'`],
  [`trap -- "cp a $X" EXIT`, `"cp a $X"`],
  [`su -c 'cp a $X'`, `'cp a $X'`],
  [`flock /tmp/l -c 'cp a $X'`, `'cp a $X'`],
]

/** Variables outside write targets, and plain write targets: not refused for that. */
const ALLOWED = [
  'echo $X',
  'ls $DIR',
  'cat $F > out.txt',
  'cp $SRC b',
  'x=$(ls $D) && echo $x',
  'for f in $L; do echo $f; done',
  'diff <(ls $A) <(ls $B)',
  "echo '$X' > f",
  'echo x >&2',
  'ls 2>&1 | head',
  'echo $((1 > 2))',
  `sed -i '' "s/$X/y/" file`,
  "cat > .scratch/p.ts <<'EOF'\nconst x = `${y}` > $z\nEOF\necho ok",
  'cd src && echo x > out.txt',
  // a quoted here-document's text is not run, and an unquoted one with only $X runs nothing
  "cat > f <<'EOF'\n$(rm x) `pwd` > $y\nEOF",
  'cat > f <<"EOF"\n$(rm x)\nEOF',
  'cat <<EOF\nhello $X\nEOF',
  "eval 'echo x > out'",
  "bash -c 'echo hi > out'",
  'bash script.sh',
  'sudo -u me ls $D',
  'env X=1 ls $D',
  '$EDITOR f',
  "find . -name '*.ts' -exec grep -l x {} +",
  "bash -c -- 'echo hi > out'",
  'env -C src ls $D',
  'sudo -D src ls $D',
  'source ./env.sh',
  '. scripts/x.sh',
  "trap 'rm -f out' EXIT",
]

test('T-963: a write or cd target built from a variable or command output is refused, with a clear reason', () => {
  for (const [c, word] of REFUSED) {
    expect(unresolvedTarget(c)).toBe(word)
    // refused; a path it also names in the owner's copy (`$(pwd)/../../f`) keeps that clearer reason
    const got = no(c)
    expect([c, got === BASH_UNRESOLVED + word || (got !== undefined && !got.startsWith(BASH_UNRESOLVED))]).toEqual([c, true])
  }
  expect(bashOutsideText(BASH_UNRESOLVED + '$X', WT)).toBe(
    "Refused: symcc can't check a path built from $X; write the path out in full (a variable or command output in where a command writes, or in cd, may lead outside your own folder).",
  )
  // a long or odd word is cut and its control characters are dropped
  const long = bashOutsideText(`${BASH_UNRESOLVED}$X\n${'a'.repeat(300)}`, WT)
  expect(long.includes('\n')).toBe(false)
  expect(long.length < 300).toBe(true)
})

test('T-963: variables outside write targets still pass', () => {
  for (const c of ALLOWED) {
    expect(unresolvedTarget(c)).toBe(undefined)
    expect(no(c)).toBe(undefined)
  }
})

test('T-963: through checkEdit, a worker and a checker are refused, the lead is not checked', async () => {
  S.root = ROOT
  const $ = fakeHost().host
  workers.set('w1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
  checkerRuns.set('c1', { task: 'T-1', worktree: WT, end: () => undefined })
  const cmd = 'X=/rep; echo x > "$X"o/README.md'
  for (const id of ['w1', 'c1']) {
    expect(await checkEdit($, id, { command: cmd }, WT)).toBe(bashOutsideText(BASH_UNRESOLVED + '"$X"o/README.md', WT))
    expect(await checkEdit($, id, { command: 'cd $X' }, WT)).toBe(bashOutsideText(BASH_UNRESOLVED + '$X', WT))
    expect(await checkEdit($, id, { command: 'echo $X' }, WT)).toBe(undefined)
  }
  // the lead (no agent id) is never checked
  expect(await checkEdit($, undefined, { command: cmd }, WT)).toBe(undefined)
})
