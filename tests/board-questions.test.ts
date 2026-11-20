import { expect } from 'claude-code/testing'
import { test } from './reset'
import { leadGuide } from '../hooks/app/tools'
import { workerQuestionText } from '../hooks/app/workers'
import { overtimeLeadText } from '../hooks/app/cleanup'
import { S } from '../hooks/app/state'
import { CLAUDE_WORDS } from '../hooks/claude/host'

// T-570, T-579: with a pop-up question tool, the lead only asks with the pop-up: symcc puts it on the board by
// itself (a Q-n, or tied to the task's own board question), and whichever is answered first closes the other.
test('the lead asks board questions with AskUserQuestion, which reaches the board by itself', () => {
  S.W = CLAUDE_WORDS // Claude Code's words (T-371: another host may have no pop-up question tool)
  const guide = leadGuide()
  expect(guide).not.toContain('Never use AskUserQuestion')
  expect(guide).toContain('with AskUserQuestion (2 to 4 short options). symcc puts each such question on the board by itself as a Q-n, so don\'t also add a symcc question for it.')
  expect(guide).toContain("symcc ties that pop-up to the task's own board question (no Q-n is added): whichever the owner answers first closes the other.")
  expect(guide).not.toContain('you can close the pop-up')
  expect(guide).not.toContain('close the board question yourself')
  expect(guide).toContain("Don't stack two questions under the same numbers")
  expect(guide).not.toContain('e.g. with AskUserQuestion')
  expect(guide).toContain('offer the three choices as numbered plain chat text (1 Done, 2 Keep as a note, 3 Ask more), plus "or answer on the board"')
  for (const text of [workerQuestionText('T-5', 'Which one?', ['A', 'B']), overtimeLeadText('T-5', 'x', 45)]) {
    expect(text).not.toContain('e.g. with AskUserQuestion')
    expect(text).not.toContain('not AskUserQuestion')
    expect(text).not.toContain('numbered plain chat text')
    expect(text).toContain("symcc then ties the pop-up to T-5's board question, so whichever the owner answers first closes the other.")
  }
  expect(workerQuestionText('T-5', 'Which one?', ['A', 'B'])).toContain('offering the options with AskUserQuestion, plus "or answer on the board"')
  expect(overtimeLeadText('T-5', 'x', 45)).toContain('offering these with AskUserQuestion, plus "or answer on the board"')
  // more than 4 options: the pop-up shows the first 3 plus "the rest on the board"
  expect(guide).toContain('AskUserQuestion takes at most 4 options per question: when a question has more, show the first 3 plus "the rest on the board"')
  expect(workerQuestionText('T-5', 'Which?', ['A', 'B', 'C', 'D', 'E'])).toContain('show the first 3 plus "the rest on the board"')
  expect(workerQuestionText('T-5', 'Which?', ['A', 'B', 'C', 'D'])).not.toContain('the rest on the board')
})
