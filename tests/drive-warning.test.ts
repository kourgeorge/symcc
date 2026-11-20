// T-643: a session that does not drive the board says so loudly: a warning line under the board's banner (with how to
// take over, /symcc-drive), a mark early in the band and the status line, "runs in the other session" on a claimed doing
// task's row, and "it looks idle" when a task has waited more than 5 minutes for its worker to start in the driving session.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { bandNote, bannerLines, bannerText, driveWarning, driverLooksIdle, statusLine, DRIVER_IDLE_MS, OTHER_SESSION_NOTE } from '../hooks/core/banner'
import { emptyBoard } from '../hooks/core/board-file'

const NOW = Date.parse('2026-11-20T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const claimed = (ms: number, note = 'starting at the next turn') => ({ id: 'T-1', status: 'doing' as const, note, updated_at: ago(ms), attempts: 0 })

test('T-643: the board warning: the full text when it fits, shorter forms when narrow, none when this session drives', () => {
  const tasks = [claimed(60_000)]
  expect(driveWarning(true, tasks, NOW)).toBe('')
  expect(driveWarning(false, tasks, NOW)).toBe('⚠ Another session drives this board — its workers run there, not here. /symcc-drive to drive it from here.')
  for (const w of [30, 40, 60, 80]) {
    const t = driveWarning(false, tasks, NOW, 'symcc', 'board', w)
    expect(t.length <= w).toBe(true)
    expect(t).toContain('/symcc-drive')
  }
  // another plugin name changes the command
  expect(driveWarning(false, tasks, NOW, 'acme')).toContain('/acme-drive')
})

test('T-643: "it looks idle" only when a claimed doing task has waited past DRIVER_IDLE_MS with no try running', () => {
  expect(driverLooksIdle([claimed(DRIVER_IDLE_MS - 1000)], NOW)).toBe(false)
  expect(driverLooksIdle([claimed(DRIVER_IDLE_MS + 1000)], NOW)).toBe(true)
  expect(driverLooksIdle([claimed(DRIVER_IDLE_MS + 1000, 'worker starting')], NOW)).toBe(true)
  // its worker runs (an open try), or another note: not idle
  expect(driverLooksIdle([{ ...claimed(DRIVER_IDLE_MS + 1000), runs: [{ started: ago(60_000) }] }], NOW)).toBe(false)
  expect(driverLooksIdle([claimed(DRIVER_IDLE_MS + 1000, 'worker on it')], NOW)).toBe(false)
  expect(driverLooksIdle([{ ...claimed(DRIVER_IDLE_MS + 1000), status: 'todo' as const }], NOW)).toBe(false)
  const idle = [claimed(6 * 60_000)]
  expect(driveWarning(false, idle, NOW)).toBe('⚠ Another session drives this board, but it looks idle — its workers run there, not here. /symcc-drive to drive it from here.')
  expect(driveWarning(false, idle, NOW, 'symcc', 'band')).toBe('⚠ driven by another session (it looks idle)')
  expect(driveWarning(false, [claimed(60_000)], NOW, 'symcc', 'band')).toBe('⚠ driven by another session')
})

test('T-643: the terminal banner ends with the warning line in the warning tone when not driving, and has none when driving', () => {
  const b = { ...emptyBoard(), branch: 'main', tasks: [claimed(60_000)] }
  const other = bannerLines(b, '/Users/me/repositories/symcc', '/Users/me', false, 200, NOW)
  expect(other.at(-1)!.parts).toEqual([{ text: '⚠ Another session drives this board — its workers run there, not here. /symcc-drive to drive it from here.', tone: 'warning' }])
  expect(bannerText(other.at(-1)!)).toBe(other.at(-1)!.parts[0]!.text)
  // narrow: a short form, no drawing, never wider than the panel
  const narrow = bannerLines(b, '/Users/me/repositories/symcc', '/Users/me', false, 40, NOW)
  expect(narrow.at(-1)!.parts[0]!.tone).toBe('warning')
  expect(narrow.every(l => bannerText(l).length <= 40)).toBe(true)
  expect(bannerText(narrow.at(-1)!)).toContain('/symcc-drive')
  // idle
  const idle = bannerLines({ ...b, tasks: [claimed(10 * 60_000)] }, '/Users/me/repositories/symcc', '/Users/me', false, 200, NOW)
  expect(bannerText(idle.at(-1)!)).toContain('but it looks idle')
  // driving: no warning line anywhere
  const own = bannerLines(b, '/Users/me/repositories/symcc', '/Users/me', true, 200, NOW)
  expect(own.some(l => bannerText(l).includes('⚠'))).toBe(false)
})

test('T-643: the status line says "driven by another session" right after the mode, whatever the board holds', () => {
  const t = (status: 'doing' | 'todo' | 'failed', id: string) => ({ id, status })
  expect(statusLine({ tasks: [t('doing', 'T-1'), t('todo', 'T-2')] }, false, '', 'auto', false, undefined, NOW)).toBe('⏵ auto · driven by another session · T-1 doing · 1 to do')
  expect(statusLine({ tasks: [t('failed', 'T-3')] }, false, '', 'auto', false, undefined, NOW)).toBe('⏵ auto · driven by another session · 1 failed (T-3)')
  expect(statusLine({ tasks: [claimed(6 * 60_000)] }, false, '', 'auto', false, undefined, NOW)).toBe('⏵ auto · driven by another session (it looks idle) · T-1 doing')
  // narrow: the mark stays (the extras go first)
  expect(statusLine({ tasks: [t('doing', 'T-1')] }, false, '', 'auto', false, undefined, NOW, 40)).toMatch(/^⏵ auto · driven by another session/)
  // driving: no mark
  expect(statusLine({ tasks: [t('doing', 'T-1')] }, true, '', 'auto', false, undefined, NOW)).toBe('⏵ auto · T-1 doing')
})

test('T-643: a claimed doing task says it runs in the other session when this one does not drive', () => {
  const t = { ...claimed(60_000), runs: [], checking: undefined, time_ask: undefined, kind: undefined }
  expect(bandNote(t as never, NOW, undefined, false)).toBe(OTHER_SESSION_NOTE)
  expect(bandNote({ ...t, note: 'worker starting' } as never, NOW, undefined, false)).toBe('runs in the other session')
  expect(bandNote(t as never, NOW, undefined, true)).toBe('starting at the next turn')
  expect(bandNote(t as never, NOW)).toBe('starting at the next turn')
  // other notes stay as they are
  expect(bandNote({ ...t, note: 'tests failed' } as never, NOW, undefined, false)).toBe('tests failed')
})
