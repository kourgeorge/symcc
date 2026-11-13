// T-167: the message after /symcc or /symcc-tasks lists the board's keys, without "Esc to close" (Esc doesn't reach the panel).
import { expect, test } from 'claude-code/testing'
import { BOARD_OPENED } from '../hooks/register'

test('the "Board opened" message names the keys and has no Esc hint', () => {
  expect(BOARD_OPENED).toBe('Board opened: ↑↓ to move, Enter to open, f to search, t tasks, s scouts, c settings. (ctrl+x tab goes back to it.)')
  expect(BOARD_OPENED).not.toMatch(/esc/i)
})
