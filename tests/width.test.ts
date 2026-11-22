import { expect, test } from 'claude-code/testing'
import * as board from '../hooks/board'
import * as stats from '../hooks/core/stats'
import { cutTitle, fitSegs, padWidth, STATS_WIDTH, textWidth, wrapLine } from '../hooks/core/width'

test('width: the screen-width helpers live in core/width and board.ts hands out the same ones', () => {
  expect(textWidth('ab漢')).toBe(4)
  expect(padWidth('漢', 4)).toBe('漢  ')
  expect(cutTitle('abcdef', 4)).toBe('abc…')
  expect(fitSegs([{ text: 'ab' }, { text: 'cdef' }], 4)).toEqual([{ text: 'ab' }, { text: 'c…' }])
  expect(STATS_WIDTH).toBe(80)
  expect(wrapLine('short')).toEqual(['short'])
  expect(board.textWidth === textWidth && board.padWidth === padWidth && board.cutTitle === cutTitle && board.wrapLine === wrapLine && board.fitSegs === fitSegs).toBe(true)
  expect(stats.textWidth === textWidth && stats.cutTitle === cutTitle).toBe(true)
})
