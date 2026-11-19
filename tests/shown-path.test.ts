// T-529: one helper shows file names safely (shownPath, control characters become "?"), and one name list
// (nameList: at most 10 names, then "and N more") is shared by core/review's texts and app/review's failures.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { shownPath } from '../hooks/core/text'
import { nameList, secretsLeftText, outOfScopeText } from '../hooks/board'

test('shownPath turns control characters into "?" and keeps the rest', () => {
  expect(shownPath('a\nb\u001b[31mc\u007f\u0085d\u0000.env')).toBe('a?b?[31mc??d?.env')
  expect(shownPath('tests/ünï cødé.env')).toBe('tests/ünï cødé.env')
  expect(shownPath('')).toBe('')
})

test('nameList shows at most 10 names, then how many more, each through shownPath', () => {
  expect(nameList([])).toBe('')
  expect(nameList(['tests/.env'])).toBe('tests/.env')
  expect(nameList(['a\n.env', 'id_rsa'])).toBe('a?.env, id_rsa')
  const ten = Array.from({ length: 10 }, (_, i) => `f${i}.env`)
  expect(nameList(ten)).toBe(ten.join(', '))
  expect(nameList([...ten, 'x.env', 'y\u001b.env'])).toBe(`${ten.join(', ')}, and 2 more`)
})

test('the texts built on them show names the same way', () => {
  expect(secretsLeftText(['a\n.env'], 'in\tx')).toBe('left out a?.env: the name looks like a secret, so it was not committed or merged (in?x)')
  expect(outOfScopeText(['x\ny.ts'], ['a.ts'])).toContain('changed files outside the task (x?y.ts); allowed: a.ts')
})
