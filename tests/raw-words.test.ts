// T-553: rawWords is the one word splitter of the shell guard; `rawWords(...).map(x => x.w)` gives the words the old
// plainWords gave, with and without braceLit.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { braceLit, rawWords } from '../hooks/core/ask'

/** [command, words, words with braceLit], the expected words written out from what plainWords gave. */
const SAMPLES: [string, string[], string[]][] = [
  ['a b  c', ['a', 'b', 'c'], ['a', 'b', 'c']],
  [`'a b' "c d"`, ['a b', 'c d'], ['a b', 'c d']],
  [`x '' y ""`, ['x', '', 'y', ''], ['x', '', 'y', '']],
  ['a\\ b', ['a b'], ['a b']],
  ['"a\\"b"', ['a"b'], ['a"b']],
  [`'a\\b'`, ['a\\b'], ['a\\b']],
  ['a\\', ['a'], ['a']],
  ['git{a,b}', ['git{a,b}'], ['git{a,b}']],
  [`'{"h":"%h"}'`, ['{"h":"%h"}'], ['_"h":"%h"_']],
  ['\\{git,stash}', ['{git,stash}'], ['_git,stash}']],
  ['"a,b"{c,d}', ['a,b{c,d}'], ['a_b{c,d}']],
  [`it's"x y"z`, [`its"x y"z`], [`its"x y"z`]],
  ['', [], []],
]

test('rawWords(...).map(x => x.w) gives the words plainWords gave', () => {
  for (const [cmd, words, braces] of SAMPLES) {
    expect(rawWords(cmd).map(x => x.w)).toEqual(words)
    expect(rawWords(cmd, braceLit).map(x => x.w)).toEqual(braces)
  }
})
