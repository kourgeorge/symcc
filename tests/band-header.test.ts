// T-576: the band above the prompt's header: "𝄞 symcc" (no "board", no version), the project only when it isn't symcc.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { ICON } from '../hooks/name'
import { bandBrand, bandWhere } from '../hooks/board'
import { S } from '../hooks/app/state'
import { bandTitle } from '../hooks/claude/ui/above-prompt'

test('T-576: the band header says "𝄞 symcc", the project only when it is not called symcc, then the state', () => {
  expect(bandBrand('symcc')).toBe(`${ICON} symcc`)
  expect(bandWhere('/Users/me/repositories/symcc', 'symcc')).toBe('')
  expect(bandWhere('/Users/me/repositories/wats', 'symcc')).toBe(' · wats')
  S.version = '0.5.8'
  for (const [root, line] of [
    ['/Users/me/repositories/symcc', `${ICON} symcc ⏵ auto · 2/3 workers · 2 merging · 4 doing · 1 to do`],
    ['/Users/me/repositories/wats', `${ICON} symcc · wats ⏵ auto · 2/3 workers · 2 merging · 4 doing · 1 to do`],
  ] as const) {
    const t = bandTitle(120, () => `${bandWhere(root, S.N.name)} ⏵ auto · 2/3 workers · 2 merging · 4 doing · 1 to do`)
    const text = t.brand + t.facts
    expect(text).toBe(line)
    expect(text).not.toContain('board')
    expect(text).not.toContain('0.5.8')
  }
})
