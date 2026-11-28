import { expect, test } from 'claude-code/testing'
import * as board from '../hooks/board'
import * as stats from '../hooks/core/stats'
import * as text from '../hooks/core/stats-text'
import * as usage from '../hooks/core/scout-usage'

test('T-1057: the stats text report and the scouts.json usage live in their own files, and board.ts hands out the same ones', () => {
  const textNames = ['statsReport', 'statsDataOf', 'headlineParts', 'spreadLines', 'stageLines', 'failedCountsNote', 'teamLines', 'teamDataLines', 'unreadText'] as const
  const usageNames = ['parseScoutUsage', 'addScoutRun', 'keepScoutUsage', 'scoutTotals'] as const
  const wrong: string[] = []
  for (const n of textNames) {
    if (typeof text[n] !== 'function') wrong.push(`${n} not in core/stats-text`)
    if ((board as Record<string, unknown>)[n] !== text[n]) wrong.push(`${n} differs in board.ts`)
    if (n in stats) wrong.push(`${n} still in core/stats`)
  }
  for (const n of usageNames) {
    if (typeof usage[n] !== 'function') wrong.push(`${n} not in core/scout-usage`)
    if ((board as Record<string, unknown>)[n] !== usage[n]) wrong.push(`${n} differs in board.ts`)
    if (n in stats) wrong.push(`${n} still in core/stats`)
  }
  expect(wrong).toEqual([])
})
