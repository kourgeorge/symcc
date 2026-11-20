// The one short date and time both hosts show on a task page (T-574): hooks/core's `when` turns a stored ISO time
// (UTC) into local time for the time zone it is given, the same text Claude Code's pages and OpenCode's page show.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { when, localOffset } from '../hooks/core/days'
import { when as boardWhen } from '../hooks/board'

const ISO = '2026-11-17T12:00:00.000Z'

test('T-574: when shows an ISO time in the given time zone, not its UTC clock', () => {
  // 12:00 UTC at UTC+2 reads as 14:00 UTC would read at UTC+0
  expect(when(ISO, 120)).toBe(when('2026-11-17T14:00:00.000Z', 0))
  expect(when(ISO, 120)).not.toBe(when(ISO, 0))
  // a negative offset can move it to the day before
  expect(when('2026-11-17T01:00:00.000Z', -180)).toBe(when('2026-11-16T22:00:00.000Z', 0))
  expect(when(ISO, 0)).toMatch(/Nov 17/)
})

test('T-574: by default when uses the owner\'s own time zone, and says "?" for no time', () => {
  expect(when(ISO)).toBe(when(ISO, localOffset(Date.parse(ISO))))
  expect(when(ISO)).toBe(new Date(ISO).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))
  expect(when('')).toBe('?')
  expect(when('not a time')).toBe('?')
  // the board's helpers give the same function both hosts use
  expect(boardWhen).toBe(when)
})
