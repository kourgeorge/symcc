// T-839: the shared small checks: isFinished (done or dropped) in board-file.ts, isObj and isNum in text.ts.
// Each replaced copies spread over hooks/, so they must answer exactly as those copies did.
import { expect } from 'claude-code/testing'
import { FINISHED, isFinished } from '../hooks/board'
import { splits } from '../hooks/core/board-parts'
import { isNum, isObj } from '../hooks/core/text'
import { test } from './reset'

test('T-839: isFinished is true only for done and dropped, and splits agrees with it', () => {
  expect([...FINISHED]).toEqual(['done', 'dropped'])
  for (const status of ['backlog', 'todo', 'doing', 'paused', 'waiting', 'review', 'failed', 'done', 'dropped', undefined, 'DONE', 3]) {
    const want = status === 'done' || status === 'dropped'
    expect(isFinished({ status })).toBe(want)
    expect(splits({ status })).toBe(want)
  }
  expect(isFinished(null)).toBe(false)
  expect(isFinished(undefined)).toBe(false)
})

test('T-839: isObj takes only plain objects, isNum only finite numbers', () => {
  expect(isObj({})).toBe(true)
  expect(isObj({ a: 1 })).toBe(true)
  for (const x of [null, undefined, [], [1], 'x', 0, 1, true, false]) expect(isObj(x)).toBe(false)
  expect(isNum(0)).toBe(true)
  expect(isNum(-2.5)).toBe(true)
  for (const x of [NaN, Infinity, -Infinity, '1', null, undefined, {}, []]) expect(isNum(x)).toBe(false)
})
