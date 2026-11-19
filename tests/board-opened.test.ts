// T-167: the message after /symcc or /symcc-tasks lists the board's keys, without "Esc to close" (Esc doesn't reach the panel).
// T-475: the key that goes back to the board is the host's word (HostWords.backToBoard): Claude Code's "ctrl+x tab".
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { BOARD_OPENED } from '../hooks/register'
import { boardOpened } from '../hooks/app/symcc'
import { S } from '../hooks/app/state'
import { SYMCC_WORDS } from '../hooks/host'
import { CLAUDE_WORDS } from '../hooks/claude/host'

test('the "Board opened" message names the keys and has no Esc hint', () => {
  S.W = CLAUDE_WORDS
  expect(boardOpened()).toBe('Board opened: ↑↓ to move, Enter to open, f to search, t tasks, s scouts, c settings. (ctrl+x tab goes back to it.)')
  expect(boardOpened()).not.toMatch(/esc/i)
})

test('a host with no key back to the board gets the message without that hint', () => {
  S.W = SYMCC_WORDS
  expect(boardOpened()).toBe(BOARD_OPENED)
  expect(BOARD_OPENED).toBe('Board opened: ↑↓ to move, Enter to open, f to search, t tasks, s scouts, c settings.')
})
