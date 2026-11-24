// T-643: a session that does not drive the board says so loudly: a warning line under the board's banner (with how to
// take over, /symcc-drive), a mark early in the band and the status line, "runs in the other session" on a claimed doing
// task's row, and "it looks idle" when a task has waited more than 5 minutes for its worker to start in the driving session.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { bandNote, bannerLines, bannerText, driveWarning, driverLooksIdle, statusLine, DRIVER_IDLE_MS, boardText } from '../hooks/core/banner'
import { detailRows, OTHER_SESSION_NOTE, STATE_LABEL, sessionNote } from '../hooks/core/details'
import { taskStateGroups } from '../hooks/core/page-header'
import { emptyBoard } from '../hooks/core/board-file'

const NOW = Date.parse('2026-11-20T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const claimed = (ms: number, note = 'starting at the next turn') => ({ id: 'T-1', status: 'doing' as const, note, updated_at: ago(ms), attempts: 0 })

const FOLLOW = '⚠ this window follows; /symcc-drive to drive from here'

test('T-643, T-952: the follow warning: the full text when it fits, shorter forms when narrow, none when this session drives', () => {
  const tasks = [claimed(60_000)]
  expect(driveWarning(true, tasks, NOW)).toBe('')
  // nothing known of the driver: no brackets
  expect(driveWarning(false, tasks, NOW)).toBe(FOLLOW)
  for (const w of [30, 40, 60, 80]) {
    const t = driveWarning(false, tasks, NOW, 'symcc', w)
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
  expect(driveWarning(false, idle, NOW)).toBe('⚠ this window follows (the driver looks idle); /symcc-drive to drive from here')
  expect(driveWarning(false, idle, NOW, 'symcc', Infinity, { heartbeat: NOW - 10_000, active: NOW - 3 * 60_000 })).toBe('⚠ this window follows (driver active 3 min ago, looks idle); /symcc-drive to drive from here')
})

test('T-643, T-694: the terminal banner has the warning line in the warning tone right under the tests/limits line when not driving, and none when driving', () => {
  const b = { ...emptyBoard(), branch: 'main', tasks: [claimed(60_000)] }
  const other = bannerLines(b, '/Users/me/repositories/symcc', '/Users/me', false, 200, NOW)
  const at = other.findIndex(l => bannerText(l).includes('⚠'))
  expect(bannerText(other[at - 1]!)).toContain('no test command · 3 at once')
  expect(other[at]!.parts).toEqual([{ text: FOLLOW, tone: 'warning' }])
  // the counts line still comes after it
  expect(bannerText(other.at(-1)!)).toContain('1 doing')
  // narrow: a short form, no drawing, never wider than the panel
  const narrow = bannerLines(b, '/Users/me/repositories/symcc', '/Users/me', false, 40, NOW)
  expect(narrow[3]!.parts[0]!.tone).toBe('warning')
  expect(narrow.every(l => bannerText(l).length <= 40)).toBe(true)
  expect(bannerText(narrow[3]!)).toContain('/symcc-drive')
  // idle
  const idle = bannerLines({ ...b, tasks: [claimed(10 * 60_000)] }, '/Users/me/repositories/symcc', '/Users/me', false, 200, NOW)
  expect(idle.map(bannerText).join('\n')).toContain('⚠ this window follows (the driver looks idle); /symcc-drive to drive from here')
  // driving: no warning line anywhere
  const own = bannerLines(b, '/Users/me/repositories/symcc', '/Users/me', true, 200, NOW)
  expect(own.some(l => bannerText(l).includes('⚠'))).toBe(false)
})

test('T-643, T-952: the status line says this window follows right after the mode, whatever the board holds', () => {
  const t = (status: 'doing' | 'todo' | 'failed', id: string) => ({ id, status })
  const follows = 'this window follows; /symcc-drive to drive from here'
  expect(statusLine({ tasks: [t('doing', 'T-1'), t('todo', 'T-2')], home_branch: 'main' }, false, { nowMs: NOW })).toBe(`⏵ auto merge · ${follows} · main · today ✓ 0`)
  expect(statusLine({ tasks: [t('failed', 'T-3')], home_branch: 'main' }, false, { nowMs: NOW })).toBe(`⏵ auto merge · ${follows} · main · today ✓ 0`)
  expect(statusLine({ tasks: [claimed(6 * 60_000)] }, false, { nowMs: NOW })).toBe('⏵ auto merge · this window follows (the driver looks idle); /symcc-drive to drive from here · today ✓ 0')
  // narrow: the notice stays, in its short form (the other parts go first)
  expect(statusLine({ tasks: [t('doing', 'T-1')], home_branch: 'main' }, false, { nowMs: NOW, width: 50 })).toBe('⏵ auto merge · this window follows · /symcc-drive')
  // driving: "drives here"
  expect(statusLine({ tasks: [t('doing', 'T-1')], home_branch: 'main' }, true, { nowMs: NOW })).toBe('⏵ auto merge · drives here · main · today ✓ 0')
})

test('T-643: a claimed doing task says it runs in the other session when this one does not drive', () => {
  const t = { ...claimed(60_000), runs: [], live: { checking: undefined, time_ask: undefined }, kind: undefined }
  expect(bandNote(t as never, NOW, undefined, false)).toBe(OTHER_SESSION_NOTE)
  expect(bandNote({ ...t, note: 'worker starting' } as never, NOW, undefined, false)).toBe('runs in the other session')
  expect(bandNote(t as never, NOW, undefined, true)).toBe('starting at the next turn')
  expect(bandNote(t as never, NOW)).toBe('starting at the next turn')
  // other notes stay as they are
  expect(bandNote({ ...t, note: 'tests failed' } as never, NOW, undefined, false)).toBe('tests failed')
})

test('T-647: the task page\'s state line and the lead\'s text board say "runs in the other session" for a claimed doing task when this session does not drive', () => {
  const t = { ...claimed(60_000), title: 'Search', details: '', files: [], after: [], created_at: ago(60_000), history: [], runs: [] } as never
  // T-751: the note is the last group of the page header's state line (no Now row in the Details)
  const now = (driving?: boolean) => taskStateGroups(t, { nowMs: NOW, note: sessionNote(t, driving) }).at(-1)![0]!.text
  expect(detailRows(t, { roles: [], all: [t], when: s => s, nowMs: NOW }).some(r => r.label === STATE_LABEL)).toBe(false)
  expect(now(false)).toBe(OTHER_SESSION_NOTE)
  expect(now(true)).toBe('starting at the next turn')
  expect(now()).toBe('starting at the next turn')
  const b = { ...emptyBoard(), tasks: [t] }
  expect(boardText(b, NOW, undefined, undefined, 0, { driving: false })).toContain(`— ${OTHER_SESSION_NOTE}`)
  expect(boardText(b, NOW, undefined, undefined, 0)).toContain('— starting at the next turn')
  // driving alone is no filter: the whole board, not a "1 of 1 tasks (...)" list
  expect(boardText(b, NOW, undefined, undefined, 0, { driving: false })).not.toMatch(/tasks \(/)
})
