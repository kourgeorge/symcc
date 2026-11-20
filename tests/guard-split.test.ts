// T-602: ask.ts was split into ask.ts (ask_owner only), shell-words.ts, path-guard.ts and git-guard.ts; the board
// module still hands out every moved name, so callers that import from '../board' don't change.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import * as board from '../hooks/board'
import * as ask from '../hooks/core/ask'
import * as shell from '../hooks/core/shell-words'
import * as pathGuard from '../hooks/core/path-guard'
import * as gitGuard from '../hooks/core/git-guard'

test('board re-exports the split guard files unchanged', () => {
  const b = board as Record<string, unknown>
  for (const mod of [ask, shell, pathGuard, gitGuard] as Record<string, unknown>[])
    for (const [name, value] of Object.entries(mod)) expect(b[name]).toBe(value)
})

test('each moved name lives in its new file', () => {
  expect(Object.keys(ask).sort()).toEqual(['ASK_LINE', 'ASK_SCHEMA', 'ASK_SENT', 'ASK_TOOL', 'OPTIONS_MAX', 'OPTIONS_MIN', 'QUESTION_MAX_CHARS', 'parseAsk'])
  for (const name of ['rawWords', 'braceLit', 'hasBrace', 'sedScriptSafe', 'shellPieces']) expect(typeof (shell as Record<string, unknown>)[name]).toBe('function')
  for (const name of ['editOutsideFolder', 'blockedEdit', 'bashOutsideFolder', 'bashPathsToCheck', 'resolvePath', 'realPathOf', 'guardReason', 'spawnFailedText']) expect(typeof (pathGuard as Record<string, unknown>)[name]).toBe('function')
  expect(pathGuard.SCRATCH_DIR).toBe('.scratch')
  for (const name of ['gitWriteIn', 'scratchGitAllow', 'mergeStepAllow', 'gitWriteText']) expect(typeof (gitGuard as Record<string, unknown>)[name]).toBe('function')
})

test('the guards still work through the board', () => {
  expect(board.gitWriteIn('git commit -m x')).toBeDefined()
  expect(board.gitWriteIn('git status')).toBeUndefined()
  expect(board.editOutsideFolder('/p/README.md', '/p/.symcc/worktrees/T-1', '/p')).toBe('README.md')
  expect(board.rawWords("a 'b c'").map(w => w.w)).toEqual(['a', 'b c'])
})
