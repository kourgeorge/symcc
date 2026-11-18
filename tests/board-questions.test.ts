import { expect } from 'claude-code/testing'
import { test } from './reset'
import { leadGuide } from '../hooks/app/tools'
import { workerQuestionText, overtimeLeadText } from '../hooks/app/workers'
import { S } from '../hooks/app/state'
import { CLAUDE_WORDS } from '../hooks/claude/host'

// T-396: an AskUserQuestion dialog stays open in the chat when the owner answers on the
// board, so the lead must ask board-answerable questions as plain chat text.
test('the lead asks board-answerable questions as plain numbered text, not with AskUserQuestion', () => {
  S.W = CLAUDE_WORDS // Claude Code's words (T-371: another host may have no pop-up question tool)
  const guide = leadGuide()
  expect(guide).toContain('Never use AskUserQuestion for them: it opens a dialog that waits in the chat and stays open when the owner answers on the board. Keep AskUserQuestion only for questions that are not on the board.')
  expect(guide).not.toContain('e.g. with AskUserQuestion')
  expect(guide).toContain('offer the three choices as numbered plain chat text (1 Done, 2 Keep as a note, 3 Ask more), plus "or answer on the board"')
  for (const text of [workerQuestionText('T-5', 'Which one?', ['A', 'B']), overtimeLeadText('T-5', 'x', 45)]) {
    expect(text).not.toContain('e.g. with AskUserQuestion')
    expect(text).toContain('numbered plain chat text (not AskUserQuestion: its dialog stays open if they answer on the board), plus "or answer on the board"')
  }
})
