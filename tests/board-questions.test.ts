import { expect } from 'claude-code/testing'
import { test } from './reset'
import { leadGuide } from '../hooks/app/tools'
import { workerQuestionText, overtimeLeadText } from '../hooks/app/workers'
import { S } from '../hooks/app/state'
import { CLAUDE_WORDS } from '../hooks/claude/host'

// T-570: with a pop-up question tool, the lead asks every question both on the board and
// with the pop-up (same options), and closes the board question on a pop-up answer.
test('the lead asks board questions both on the board and with AskUserQuestion', () => {
  S.W = CLAUDE_WORDS // Claude Code's words (T-371: another host may have no pop-up question tool)
  const guide = leadGuide()
  expect(guide).not.toContain('Never use AskUserQuestion')
  expect(guide).toContain("you ask both ways: they stay on the board (a symcc question, or the task's own board question), and you ask them in the chat with AskUserQuestion, with the same options")
  expect(guide).toContain('If the owner answers in the pop-up, close the board question yourself')
  expect(guide).toContain('say once "answered on the board; you can close the pop-up"')
  expect(guide).toContain('on the board with symcc question (action add, with 2 to 6 short options), and ask it briefly in the chat too, with AskUserQuestion and the same options.')
  expect(guide).toContain("Don't stack two questions under the same numbers")
  expect(guide).not.toContain('e.g. with AskUserQuestion')
  expect(guide).toContain('offer the three choices as numbered plain chat text (1 Done, 2 Keep as a note, 3 Ask more), plus "or answer on the board"')
  for (const text of [workerQuestionText('T-5', 'Which one?', ['A', 'B']), overtimeLeadText('T-5', 'x', 45)]) {
    expect(text).not.toContain('e.g. with AskUserQuestion')
    expect(text).not.toContain('not AskUserQuestion')
    expect(text).not.toContain('numbered plain chat text')
    expect(text).toContain('say once "answered on the board; you can close the pop-up"')
  }
  expect(workerQuestionText('T-5', 'Which one?', ['A', 'B'])).toContain('offering the options with AskUserQuestion, plus "or answer on the board"')
  expect(overtimeLeadText('T-5', 'x', 45)).toContain('offering these with AskUserQuestion, plus "or answer on the board"')
  // more than 4 options: the pop-up shows the first 3 plus "the rest on the board"
  expect(guide).toContain('AskUserQuestion takes at most 4 options per question: when a question has more, show the first 3 plus "the rest on the board"')
  expect(workerQuestionText('T-5', 'Which?', ['A', 'B', 'C', 'D', 'E'])).toContain('show the first 3 plus "the rest on the board"')
  expect(workerQuestionText('T-5', 'Which?', ['A', 'B', 'C', 'D'])).not.toContain('the rest on the board')
})
