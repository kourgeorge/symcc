// T-481: a relative path that is only text to a command (a sed script, a grep pattern, a here-document written to a
// file) is no longer read as a path from the worker's folder, so own-folder commands of workers and checkers are not
// refused by mistake; real reads and writes of the owner's copy still are.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { checkEdit } from '../hooks/app/ask'
import { bashOutsideFolder, bashOutsideText, bashPathsToCheck, sedScriptSafe } from '../hooks/board'
import { S, workers, checkerRuns } from '../hooks/app/state'
import { fakeHost } from './fake-host'

const ROOT = '/repo'
const WT = `${ROOT}/.symcc/worktrees/T-1`
const no = (c: string, cwd?: string) => bashOutsideFolder(c, WT, ROOT, '/home/me', cwd)

/** The probe commands checkers and workers really ran (T-473, T-522, T-542, T-436, T-455). */
const ALLOWED = [
  // T-473: a sed script holding an import line
  `sed -i '' "s|from '../../prompts/checker'|from '../prompts/checker'|" hooks/core/a.ts`,
  `sed -i '' -e "s|'../../x'|'./x'|" tests/a.test.ts`,
  `sed -i.bak 's#../../x#./x#g' tests/a.test.ts`,
  `sed -n '/..\\/..\\/x/p' tests/a.test.ts`,
  // T-436: a grep pattern
  `grep -n "from '../hooks/board'" tests/merge.test.ts | head -3`,
  `grep -rn -e "import '../../x'" tests`,
  // T-522, T-542: a probe written to .scratch/ and run from there
  "cat > .scratch/p.ts <<'EOF'\nimport { bashOutsideFolder } from '../hooks/board'\nconsole.log(bashOutsideFolder('x', '/a', '/b'))\nEOF",
  "cat > .scratch/p.ts <<'EOF'\nimport { x } from '../hooks/board'\ncd ../..\nEOF\nbun .scratch/p.ts",
  "mkdir -p .scratch && cat <<'EOF' > .scratch/p.ts && bun .scratch/p.ts\nimport { x } from '../hooks/board'\nEOF",
  "cat > .scratch/p.ts <<EOF\nimport { x } from '../hooks/board'\nEOF",
  "tee .scratch/p.ts > /dev/null <<'EOF'\nimport { x } from '../hooks/board'\nEOF",
  `bun -e "import { x } from './hooks/board'; console.log(x)"`,
  'bun .scratch/p.ts',
  `echo "import { x } from '../hooks/board'" > .scratch/p.ts && bun .scratch/p.ts`,
]

/** Real reads and writes of the owner's copy, and text that may still be run or open a path. */
const REFUSED: [string, string][] = [
  ['cat ../../board.json', '.symcc/board.json'],
  ['echo x > ../../x', '.symcc/x'],
  ["sed -i '' 's/a/b/' ../../board.json", '.symcc/board.json'],
  ["sed -i '' 's/a/b/' -- ../../board.json", '.symcc/board.json'],
  // a sed script that writes (w), reads (r) or runs (e) a file
  ["sed 's/a/b/w ../../x' tests/a.ts", '.symcc/x'],
  ["sed '1r ../../board.json' tests/a.ts", '.symcc/board.json'],
  ["sed 's/x/cat ..\\/..\\/board.json/e' tests/a.ts", '.symcc/board.json/e'],
  ["sed -f ../../s.sed tests/a.ts", '.symcc/s.sed'],
  // a grep file, or patterns read from a file
  ["grep x ../../board.json", '.symcc/board.json'],
  ["grep -f ../../board.json tests/a.ts", '.symcc/board.json'],
  ["grep --file=../../board.json tests/a.ts", '.symcc/board.json'],
  // a redirect stuck to a word with no space is still a redirect, not text
  ['grep x a.ts>../../x', '.symcc/x'],
  ['grep -c x tests/a.ts>../../board.json', '.symcc/board.json'],
  ['grep x<../../board.json', '.symcc/board.json'],
  ['echo hi > .scratch/a b>../../x', '.symcc/x'],
  ['printf hi > .scratch/a b>>../../x', '.symcc/x'],
  ["sed -n p a.ts>../../x", '.symcc/x'],
  // a sed script or grep pattern that is itself the path
  ["grep -n '../../board.json' tests/a.ts", '.symcc/board.json'],
  // a here-document run by a shell or a program, piped on, or printed to the screen
  ["bash <<'EOF'\ncat ../../board.json\nEOF", '.symcc/board.json'],
  ["bun - <<'EOF'\nawait Bun.file('../../board.json').text()\nEOF", '.symcc/board.json'],
  ["cat <<'EOF' | sh\ncat ../../board.json\nEOF", '.symcc/board.json'],
  ["cat > /dev/stdout <<'EOF' | sh\ncat ../../board.json\nEOF", '.symcc/board.json'],
  ["cat > .scratch/p <<'EOF' >&2\ncat ../../board.json\nEOF", '.symcc/board.json'],
  // an unquoted here-document runs its $(...) and `...`
  ['cat > .scratch/p <<EOF\n$(cat ../../board.json)\nEOF', '.symcc/board.json'],
  // the file written is in the owner's copy
  ["cat > ../../x <<'EOF'\nhi\nEOF", '.symcc/x'],
  // a cat or sed that may be something else: a function, an alias, a changed PATH, a sourced file
  ["cat() { bash; }; cat > .scratch/p <<'EOF'\ncat ../../board.json\nEOF", '.symcc/board.json'],
  ["alias sed=cat; sed -i '' '../../board.json' x", '.symcc/board.json'],
  ["PATH=.scratch:$PATH sed -i '' 's|../../board.json||' tests/a.ts", '.symcc/board.json'],
  [". .scratch/env; grep -n 'x ../../board.json' tests/a.ts", '.symcc/board.json'],
  // echo text sent to a shell, or with $(...) in it
  ["echo 'cat ../../board.json' | sh", '.symcc/board.json'],
  ['echo "$(cat ../../board.json)" > .scratch/x', '.symcc/board.json'],
  // code passed as text may open any path in it
  [`bun -e "import('../../board.json')"`, '.symcc/board.json'],
  [`perl -pi -e 'open(F, "../../board.json")' tests/a.ts`, '.symcc/board.json'],
  [`bun -e "import { x } from '../hooks/board'"`, '.symcc/worktrees/hooks/board'],
]

test('commands whose relative paths are only text are allowed; real reads and writes of the owner\'s copy are not (T-481)', () => {
  for (const c of ALLOWED) expect([c, no(c)]).toEqual([c, undefined])
  for (const [c, rel] of REFUSED) expect([c, no(c)]).toEqual([c, rel])
  // from the shell's folder inside the worker's: still checked from there
  expect(no('cat ../board.json', `${WT}/tests`)).toBeUndefined()
  expect(no("sed -i '' 's|a|b|' ../../../board.json", `${WT}/tests`)).toBe('.symcc/board.json')
})

test('words taken as text are still looked up as whole paths for symbolic links (T-481)', () => {
  const { paths } = bashPathsToCheck("grep -n 'x' lnk/a.ts", WT, '/home/me', undefined, ROOT)
  expect(paths).toContain(`${WT}/lnk/a.ts`)
  expect(bashPathsToCheck("cat > .scratch/p.ts <<'EOF'\nimport '../lnk/x'\nEOF", WT, '/home/me', undefined, ROOT).paths).not.toContain(`${ROOT}/.symcc/worktrees/lnk/x`)
})

test('sed scripts that read, write or run nothing (T-481)', () => {
  for (const s of ['s/a/b/', 's|a|b|g', "s|'../../x'|'./x'|", '1,3d', '/x/p', '$d', 's/a/b/2;s/c/d/I', '\\#x#d', '/a/,/b/ s/x/y/', '1!G;h;$!d', 'y/abc/xyz/'])
    expect([s, sedScriptSafe(s)]).toEqual([s, true])
  for (const s of ['s/a/b/w out', 's/a/b/e', '1r file', 'R file', 'w out', 'W out', 'e ls', 's/a/b', 'q5', 'a text', '--expression=s/a/b/', ''])
    expect([s, sedScriptSafe(s) && s !== '']).toEqual([s, false])
})

test("a worker's and a checker's probe commands in their own folder pass the guard; reads of the owner's copy do not (T-481)", async () => {
  S.root = ROOT
  const $ = fakeHost().host
  workers.set('w1', { task: 'T-1', worktree: WT, branch: 'symcc/T-1', since: 0 })
  checkerRuns.set('c1', { task: 'T-1', worktree: WT, end: () => undefined })
  for (const agent of ['w1', 'c1']) {
    for (const command of ALLOWED.filter(c => !c.startsWith('sed -i') || agent === 'w1')) expect([agent, command, await checkEdit($, agent, { command }, WT)]).toEqual([agent, command, undefined])
    expect(await checkEdit($, agent, { command: 'cat ../../board.json' }, WT)).toBe(bashOutsideText('.symcc/board.json', WT))
    expect(await checkEdit($, agent, { command: 'echo x > ../../x' }, WT)).toBe(bashOutsideText('.symcc/x', WT))
    expect(await checkEdit($, agent, { command: 'grep x tests/a.ts>../../board.json' }, WT)).toBe(bashOutsideText('.symcc/board.json', WT))
    expect(await checkEdit($, agent, { command: 'grep x<../../board.json' }, WT)).toBe(bashOutsideText('.symcc/board.json', WT))
  }
})
