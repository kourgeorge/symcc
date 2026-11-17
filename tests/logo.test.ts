import { expect } from 'claude-code/testing'
import { test } from './reset'
import { ICON_ART } from '../hooks/name'
import { logo, logoNow, logoOnPublish, noteLogoWidth, playLogo } from '../hooks/plugin/logo'
import { BANNER_NARROW, SETTINGS, bannerLines, bannerText, emptyBoard, isNothing, parseBoard, readBoard, parseSettingsCommand } from '../hooks/board'
import { type LogoFacts, type LogoMove, LOGO_AREA, LOGO_ROWS, LOGO_SHAPES, LOGO_FRAME_MS, NOTE_COLUMN, DISSOLVE_ORDER, SPARKS, SWAY_EVERY_MS, allDone, isPlaying, logoFrame, mayMove, moveFrames, moveMs, pickMove, restFrame, singFrames, startMove, swayDue, swayFrames, transformFrames } from '../hooks/core/logo'

const MOVES: LogoMove[] = ['sway', 'check', 'robot', 'note', 'sing']
const at = (f: string[]) => f.join('\n')
/** The logo's 4x5 cells inside a frame at its resting place. */
const inner = (f: string[]) => f.map(r => r.slice(1, 6))

test('every frame of every move is 4 rows of the 7-column art area, so the text beside it never moves', () => {
  expect(restFrame()).toEqual(ICON_ART.map(r => ` ${r} `))
  for (const m of MOVES) {
    const fs = moveFrames(m)
    expect(fs.length).toBeGreaterThan(3)
    for (const f of fs) {
      expect(f.length).toBe(LOGO_ROWS)
      for (const row of f) expect([...row].length).toBe(LOGO_AREA)
    }
    // the banner text starts in the same column on every frame
    const b = { ...emptyBoard(), branch: 'main', tasks: [] }
    const starts = fs.map(f => bannerLines(b, '/Users/me/app', '/Users/me', true, 80, 0, 'symcc', f).slice(0, 3).map(l => l.art.length))
    for (const s of starts) expect(s).toEqual(starts[0]!)
    expect(starts[0]).toEqual([LOGO_AREA + 1, LOGO_AREA + 1, LOGO_AREA + 1])
  }
})

test('the banner draws the logo at rest the same as before when no frame is given', () => {
  const b = { ...emptyBoard(), branch: 'main', tasks: [] }
  expect(bannerLines(b, '/x/app', '/x', true, 80).slice(0, 4).map(l => l.art)).toEqual(ICON_ART.map(r => ` ${r}  `))
  expect(bannerLines(b, '/x/app', '/x', true, 80, 0, 'symcc', singFrames()[0]).map(bannerText)[3]).toContain('♪')
})

test('the sway steps one column right, back, one left, back, and ends at rest', () => {
  const pads = swayFrames().map(f => f[2]!.indexOf('┗'))
  expect(pads).toEqual([1, 2, 2, 1, 0, 0, 1, 1])
  // the drawing itself is never cut
  for (const f of swayFrames()) expect(f.map(r => r.trim())).toEqual(ICON_ART.map(r => r.trim()))
})

test('a transform dissolves the clef into its shape, holds about 1 s, and dissolves back to the clef', () => {
  expect(new Set(DISSOLVE_ORDER).size).toBe(20)
  expect(DISSOLVE_ORDER.slice(0, 4)).toEqual([0, 3, 6, 9])
  for (const shape of ['check', 'robot', 'note'] as const) {
    const fs = transformFrames(shape)
    const target = at(LOGO_SHAPES[shape])
    const shown = fs.map(f => at(inner(f)))
    const first = shown.indexOf(target)
    expect(first).toBeGreaterThan(0)
    // held for HOLD frames: about 1 s
    expect(shown.filter(x => x === target).length * LOGO_FRAME_MS).toBeGreaterThanOrEqual(1000)
    expect(at(fs.at(-1)!)).toBe(at(restFrame()))
    // some frames in between show sparks
    expect(shown.some(x => SPARKS.some(s => x.includes(s)))).toBe(true)
    // only the logo's 5 columns change: the free columns on both sides stay blank
    for (const f of fs) for (const r of f) expect(r.charAt(0) + r.charAt(6)).toBe('  ')
  }
})

test('sing: the notes float up in the column right of the logo, and the logo stays put', () => {
  const fs = singFrames()
  expect(fs.length).toBe(6)
  const rowsOf = (note: string) => fs.map(f => f.findIndex(r => r.includes(note)))
  for (const f of fs) {
    expect(f.map(r => r.slice(0, NOTE_COLUMN))).toEqual(restFrame().map(r => r.slice(0, NOTE_COLUMN)))
    for (const r of f) for (const n of ['♪', '♫']) if (r.includes(n)) expect(r.indexOf(n)).toBe(NOTE_COLUMN)
  }
  // each note rises: its row goes down by one each frame it shows
  for (const n of ['♪', '♫']) {
    const rows = rowsOf(n).filter(r => r >= 0)
    expect(rows.length).toBeGreaterThan(2)
    rows.forEach((r, i) => i && expect(r).toBe(rows[i - 1]! - 1))
  }
})

test('a move plays once, then the logo rests; one that comes while another plays is dropped', () => {
  let p = startMove(null, 'check', 1000)
  expect(logoFrame(p, 1000)).toEqual(transformFrames('check')[0]!)
  expect(logoFrame(p, 1000 + 2 * LOGO_FRAME_MS)).toEqual(transformFrames('check')[2]!)
  expect(startMove(p, 'robot', 1500)).toBe(p)
  expect(isPlaying(p, 1000 + moveMs('check'))).toBe(false)
  expect(logoFrame(p, 1000 + moveMs('check'))).toEqual(restFrame())
  p = startMove(p, 'robot', 1000 + moveMs('check'))
  expect(p!.move).toBe('robot')
  expect(swayDue(null, 0, SWAY_EVERY_MS - 1)).toBe(false)
  expect(swayDue(null, 0, SWAY_EVERY_MS)).toBe(true)
  expect(swayDue(startMove(null, 'sing', SWAY_EVERY_MS), 0, SWAY_EVERY_MS)).toBe(false)
})

test('a merge, a worker start, a scout finding and the board becoming all done pick the right move', () => {
  const facts = (tasks: [string, string][], scouts: LogoFacts['scouts'] = []): LogoFacts => ({ tasks: tasks.map(([id, status]) => ({ id, status: status as never })), scouts })
  const before = facts([['T-1', 'doing'], ['T-2', 'todo']], [{ name: 'docs', last_run: null }])
  expect(pickMove(undefined, before, isNothing)).toBe(null)
  expect(pickMove(before, before, isNothing)).toBe(null)
  expect(pickMove(before, facts([['T-1', 'done'], ['T-2', 'todo']], before.scouts), isNothing)).toBe('check')
  expect(pickMove(before, facts([['T-1', 'doing'], ['T-2', 'doing']], before.scouts), isNothing)).toBe('robot')
  // a scout's new report (it finished, last_run set at its start) plays the note
  expect(pickMove(before, facts([['T-1', 'doing'], ['T-2', 'todo']], [{ name: 'docs', last_run: null, last_report: '1. The README is out of date' }]), isNothing)).toBe('note')
  // a scout that found nothing plays nothing
  expect(pickMove(before, facts([['T-1', 'doing'], ['T-2', 'todo']], [{ name: 'docs', last_run: null, last_report: 'NOTHING' }]), isNothing)).toBe(null)
  // the last merge that leaves nothing to do sings
  expect(pickMove(facts([['T-1', 'review'], ['T-2', 'done']]), facts([['T-1', 'done'], ['T-2', 'done']]), isNothing)).toBe('sing')
  expect(allDone([{ status: 'done' }, { status: 'backlog' }, { status: 'failed' }])).toBe(true)
  expect(allDone([{ status: 'done' }, { status: 'waiting' }])).toBe(false)
  expect(allDone([])).toBe(false)
})

test('a scout run plays the note when its report arrives, not when it starts', () => {
  const at = (scout: NonNullable<LogoFacts['scouts']>[number]): LogoFacts => ({ tasks: [{ id: 'T-1', status: 'doing' as never }], scouts: [scout] })
  const old = at({ name: 'docs', last_run: '2026-11-16T09:00:00Z', last_report: '1. The README is out of date' })
  // start: last_run changes, the old finding is still the report: no note
  const started = at({ name: 'docs', last_run: '2026-11-16T10:00:00Z', last_report: '1. The README is out of date' })
  expect(pickMove(old, started, isNothing)).toBe(null)
  // finish with a new finding: the note
  const found = at({ name: 'docs', last_run: '2026-11-16T10:00:00Z', last_report: '1. The install steps are wrong' })
  expect(pickMove(started, found, isNothing)).toBe('note')
  // finish with "nothing": no note
  const none = at({ name: 'docs', last_run: '2026-11-16T10:00:00Z', last_report: 'NOTHING' })
  expect(pickMove(started, none, isNothing)).toBe(null)
  // a stopped run puts the old last_run back and keeps the old report: no note
  expect(pickMove(started, old, isNothing)).toBe(null)
})

test('nothing plays on a narrow panel, a panel not shown, or the board off', () => {
  const ok = { width: 80, shown: true }
  expect(mayMove(ok)).toBe(true)
  expect(mayMove({ ...ok, mode: 'auto', enabled: true })).toBe(true)
  expect(mayMove({ ...ok, width: BANNER_NARROW - 1 })).toBe(false)
  expect(mayMove({ ...ok, width: BANNER_NARROW })).toBe(true)
  expect(mayMove({ ...ok, shown: false })).toBe(false)
  expect(mayMove({ ...ok, mode: 'off' })).toBe(false)
  expect(mayMove({ ...ok, enabled: false })).toBe(false)
  // a narrow panel draws no logo at all
  expect(bannerLines({ ...emptyBoard(), tasks: [] }, '/x/app', '/x', true, BANNER_NARROW - 1).every(l => l.art === '')).toBe(true)
})

test('there is no logo_motion setting: an old board.json with logo_motion false loads and the logo still moves', async () => {
  const old = JSON.stringify({ ...emptyBoard(), logo_motion: false })
  const r = readBoard(old)
  expect(r.fixed.join(' ')).not.toContain('logo')
  expect(SETTINGS.map(s => s.name as string)).not.toContain('logo_motion')
  expect(parseSettingsCommand('logo_motion off').kind).not.toBe('set')
  const b = parseBoard(old)
  expect(mayMove({ ...b, width: 80, shown: true })).toBe(true)
  noteLogoWidth(80)
  expect(await playLogo(fake$() as never, 'check', { ...(b as object), enabled: true, mode: 'auto' } as never)).toBe(true)
})

/** A stand-in for the plugin's $ with just what the player uses: the open panes, a frame timer to tick by hand, and redraws counted. */
function fake$(shown = true) {
  const ticks: (() => void)[] = []
  const $ = {
    ui: { panes: async () => [{ id: 'symcc-board', title: '', isShown: shown, isFocused: false, isPlaced: true }], invalidate: () => void $.redraws++ },
    clock: { every: (_ms: number, f: () => void) => (ticks.push(f), { cancel: () => void ticks.splice(ticks.indexOf(f), 1) }) },
    redraws: 0,
    tick: () => ticks.slice().forEach(f => f()),
    timers: () => ticks.length,
  }
  return $
}
/** resetPlugin() (via the reset test) clears the logo; the player tests also need a panel wide enough to show it. */
const reset = () => noteLogoWidth(80)

test('the player: a worker start plays the robot once on the frame timer, then the timer stops and the logo rests', async () => {
  reset()
  const $ = fake$()
  const view = (status: string) => ({ tasks: [{ id: 'T-1', status }], scouts: [], enabled: true, mode: 'auto' }) as never
  await logoOnPublish($ as never, view('todo'))
  expect(logo.play).toBe(null)
  await logoOnPublish($ as never, view('doing'))
  expect(logo.play?.move).toBe('robot')
  const frames = [logoNow()]
  for (let i = 0; i < 40 && $.timers(); i++) ($.tick(), frames.push(logoNow()))
  expect($.timers()).toBe(0)
  expect(logo.play).toBe(null)
  expect(frames.slice(0, -1)).toEqual(transformFrames('robot'))
  expect(frames.at(-1)).toEqual(restFrame())
  expect($.redraws).toBeGreaterThanOrEqual(transformFrames('robot').length)
})

test('the player plays nothing on a narrow or hidden panel, and drops a move while one plays', async () => {
  reset()
  const v = { enabled: true, mode: 'auto' } as never
  expect(await playLogo(fake$(false) as never, 'check', v)).toBe(false)
  noteLogoWidth(BANNER_NARROW - 1)
  expect(await playLogo(fake$() as never, 'check', v)).toBe(false)
  noteLogoWidth(80)
  const $ = fake$()
  expect(await playLogo($ as never, 'check', v)).toBe(true)
  expect(await playLogo($ as never, 'sing', v)).toBe(false)
  expect(logo.play?.move).toBe('check')
  expect($.timers()).toBe(1)
})
