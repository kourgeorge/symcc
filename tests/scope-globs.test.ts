// T-1227: file-pattern cases for outOfScope (the merge's scope check) and blockedEdit (the worker edit guard), which
// share one matcher: * and ? stay inside one folder, **/ may sit anywhere, brackets are plain characters, a folder
// name is not a prefix match, and spaces around an entry are ignored.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { outOfScope, blockedEdit } from '../hooks/board'

test('a single * does not cross a folder', () => {
  expect(outOfScope(['src/a.ts', 'src/x/b.ts'], ['src/*.ts'])).toEqual(['src/x/b.ts'])
})

test('**/ at the start matches any folder depth, including none', () => {
  expect(outOfScope(['src/x/b.ts', 'b.ts'], ['**/b.ts'])).toEqual([])
})

test('**/ in the middle matches several folders', () => {
  expect(outOfScope(['a/b/c/d.ts'], ['a/**/d.ts'])).toEqual([])
})

test('? matches exactly one character', () => {
  expect(outOfScope(['src/a1.ts', 'src/ab.ts'], ['src/a?.ts'])).toEqual([])
})

test('? does not match a missing character', () => {
  expect(outOfScope(['src/a.ts'], ['src/a?.ts'])).toEqual(['src/a.ts'])
})

test('? does not match a folder slash', () => {
  expect(outOfScope(['src/a/.ts'], ['src/a?.ts'])).toEqual(['src/a/.ts'])
})

test('brackets are plain characters, not a character set', () => {
  expect(outOfScope(['app/[id]/page.tsx'], ['app/[id]/page.tsx'])).toEqual([])
  expect(outOfScope(['app/i/page.tsx'], ['app/[id]/page.tsx'])).toEqual(['app/i/page.tsx'])
})

test('a folder name does not match a longer folder starting with it', () => {
  expect(outOfScope(['srcx/a.ts'], ['src'])).toEqual(['srcx/a.ts'])
})

test('spaces around an entry are ignored', () => {
  expect(outOfScope(['src/a.ts'], [' src/a.ts '])).toEqual([])
})

test('blockedEdit refuses an edit one folder below a single-* pattern', () => {
  const wt = '/repo/.symcc/worktrees/T-1'
  expect(blockedEdit(`${wt}/src/x/b.ts`, wt, ['src/*.ts'], '.symcc')).toBe('src/x/b.ts')
})

test('blockedEdit allows an edit matching a single-* pattern', () => {
  const wt = '/repo/.symcc/worktrees/T-1'
  expect(blockedEdit(`${wt}/src/a.ts`, wt, ['src/*.ts'], '.symcc')).toBeUndefined()
})
