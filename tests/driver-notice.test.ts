// T-952: a window that doesn't drive the board names the window that does: when it started driving (lead.json's
// `since`, kept across its heartbeats) and when it was last active (`active`: its owner's last prompt or turn end), else
// when it last checked in (the heartbeat, for an older lead.json). Following: "this window follows (…); /symcc-drive to
// drive from here". Shorter forms when narrow: "started …" goes first, then the commands get short.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { emptyBoard, leadText, parseLead, beatText, handRequest, noHandRequest, handedText, statusLine, statusRoom, offStatusLine, offHereAnswer, driveWarning } from '../hooks/board'
import { agoShort, driverFacts, startedText } from '../hooks/core/driver-notice'
import { claimLead, startHere, disableHere } from '../hooks/app/lead'
import { runCommand } from '../hooks/app/symcc'
import { takeBoardUpdate } from '../hooks/app/tell'
import { S } from '../hooks/app/state'
import { saveBoard } from '../hooks/app/store'
import { fakeHost, memoryFs, done } from './fake-host'

// local time, as the notice shows it
const SINCE = new Date(2026, 10, 23, 9, 26).getTime()
const NOW = SINCE + 9 * 3_600_000
const MIN = 60_000
const DRIVER = { heartbeat: NOW - 10_000, since: SINCE, active: NOW - 3 * MIN }
const OLD = { heartbeat: NOW - 10_000 }
const ROOM = statusRoom('symcc')

test('T-952: times read the way the owner says them', () => {
  expect(startedText(SINCE)).toBe('Nov 23 09:26')
  expect(agoShort(2_000)).toBe('just now')
  expect(agoShort(10_000)).toBe('10 s ago')
  expect(agoShort(3 * MIN)).toBe('3 min ago')
  expect(agoShort(125 * MIN)).toBe('2 h ago')
})

test('T-952: off here: the answer and the status line say so and how to turn it on', () => {
  expect(offHereAnswer('symcc')).toBe('symcc is off in this window. /symcc-enable turns it back on.')
  expect(offStatusLine('symcc', true, 'off')).toBe('symcc is off in this window · /symcc-enable')
})

test('T-952: an older lead.json with no since or active still works: only the heartbeat age shows', () => {
  const l = parseLead(leadText('a', NOW - 10_000))!
  expect(l.since).toBe(undefined)
  expect(l.active).toBe(undefined)
  expect(driverFacts(l)).toEqual(OLD)
  expect(driveWarning(false, [], NOW, 'symcc', Infinity, driverFacts(l))).toBe('⚠ this window follows (driver checked in 10 s ago); /symcc-drive to drive from here')
})

test('T-952: a following window: the band and board warning name the driver; the status line has the short forms', () => {
  expect(driveWarning(false, [], NOW, 'symcc', Infinity, DRIVER)).toBe('⚠ this window follows (driver started Nov 23 09:26, active 3 min ago); /symcc-drive to drive from here')
  expect(driveWarning(false, [], NOW, 'symcc', 85, DRIVER)).toBe('⚠ this window follows (driver active 3 min ago); /symcc-drive to drive from here')
  expect(driveWarning(false, [], NOW, 'symcc', 65, DRIVER)).toBe('⚠ this window follows (driver active 3 min ago) · /symcc-drive')
  expect(driveWarning(false, [], NOW, 'symcc', 30, DRIVER)).toBe('⚠ this window follows · /symcc-drive')
  // the status line: the mode in front, the notice in the room left
  const line = statusLine({ tasks: [{ id: 'T-1', status: 'doing' }], home_branch: 'main' }, false, { nowMs: NOW, width: ROOM, driver: DRIVER })!
  expect(line).toBe('⏵ auto merge · follows (driver active 3 min ago) · /symcc-drive · main')
  expect(line.length <= ROOM).toBe(true)
  expect(statusLine({ tasks: [{ id: 'T-1', status: 'doing' }] }, false, { nowMs: NOW, driver: DRIVER })).toBe('⏵ auto merge · this window follows (driver started Nov 23 09:26, active 3 min ago); /symcc-drive to drive from here · today ✓ 0')
})

test('T-952: lead.json keeps `since` across heartbeats and saves the newest `active`; a claim starts a new `since`', () => {
  const t0 = NOW - 60 * MIN
  // nobody drove: a's first heartbeat claims the board now
  const first = beatText(null, 'a', t0)
  expect(parseLead(first)).toEqual({ session: 'a', heartbeat: t0, since: t0 })
  // later heartbeats keep it; the owner's activity is saved and never goes back
  const second = beatText(first, 'a', t0 + 30_000, t0 + 20_000)
  expect(parseLead(second)).toEqual({ session: 'a', heartbeat: t0 + 30_000, since: t0, active: t0 + 20_000 })
  const third = beatText(second, 'a', t0 + 60_000, null)
  expect(parseLead(third)).toEqual({ session: 'a', heartbeat: t0 + 60_000, since: t0, active: t0 + 20_000 })
  // an older lead.json of the same session (no since yet): since starts now
  expect(parseLead(beatText(leadText('a', t0), 'a', t0 + 30_000))?.since).toBe(t0 + 30_000)
  // another window's ask to drive and its cancel keep the driver's times
  expect(parseLead(handRequest(third, 'b', t0 + 61_000))).toMatchObject({ session: 'a', since: t0, active: t0 + 20_000, handTo: 'b' })
  expect(parseLead(noHandRequest(handRequest(third, 'b', t0 + 61_000)))).toEqual(parseLead(third))
  // b takes over (handed to it, or the old driver went stale): b's own since starts, a's activity is not b's
  expect(parseLead(beatText(handedText('b', 'a', t0 + 62_000), 'b', t0 + 90_000))).toEqual({ session: 'b', heartbeat: t0 + 90_000, since: t0 + 90_000 })
  expect(parseLead(beatText(third, 'b', t0 + 900_000))).toEqual({ session: 'b', heartbeat: t0 + 900_000, since: t0 + 900_000 })
})

/** A fake Host on in-memory files (mv/ln/rm done on them), recording the status line. */
function world(me: string) {
  const files = new Map<string, string>()
  const status: (string | undefined)[] = []
  const w = fakeHost({
    session: { id: async () => me, repo: async () => null, root: async () => '/', usage: async () => ({}) },
    fs: memoryFs(files),
    run: async argv => {
      const [cmd, ...rest] = argv
      const args = rest.filter(a => !a.startsWith('-'))
      if (cmd === 'mv' || cmd === 'ln') {
        const [from, to] = args as [string, string]
        if (!files.has(from)) return done({ exitCode: 1, stderr: 'No such file' })
        if (cmd === 'ln' && files.has(to)) return done({ exitCode: 1, stderr: 'File exists' })
        files.set(to, files.get(from)!)
        if (cmd === 'mv') files.delete(from)
        return done()
      }
      if (cmd === 'rm') for (const a of args) files.delete(a)
      return done()
    },
    ui: { status: t => void status.push(t) },
  })
  return { ...w, files, status, lead: `/repo/${S.N.leadFile}` }
}

test('T-952: the driving window saves since and active in lead.json; a following window shows them in its view and status line', async () => {
  S.root = '/repo'
  S.me = 'a'
  const a = world('a')
  await saveBoard(a.host, { ...emptyBoard(), tasks: [] })
  expect(await claimLead(a.host, true)).toBe(true)
  const since = parseLead(a.files.get(a.lead)!)!.since!
  expect(typeof since).toBe('number')
  // the owner types a prompt there; the next heartbeat keeps since and saves active
  S.activeAt = since + 1_000
  expect(await claimLead(a.host)).toBe(true)
  expect(parseLead(a.files.get(a.lead)!)).toMatchObject({ session: 'a', since, active: since + 1_000 })
  // another window, following: same files, symcc on, not driving
  S.me = 'b'
  S.driving = false
  S.activeAt = null
  const b = world('b')
  for (const [p, t] of a.files) b.files.set(p, t)
  expect(await claimLead(b.host, true)).toBe(false)
  expect((b.panel.view() as { driver?: unknown }).driver).toMatchObject({ since, active: since + 1_000 })
  const line = b.status.at(-1) ?? ''
  expect(line).toContain('follows (driver active ')
  expect(line).toContain('/symcc-drive')
  // lead.json is the driver's, unchanged by the follower
  expect(parseLead(b.files.get(b.lead)!)).toMatchObject({ session: 'a', since, active: since + 1_000 })
})

test('T-952: /symcc-drive in a following window asks to drive; one turned off on purpose stays off', async () => {
  S.root = '/repo'
  S.me = 'b'
  const b = world('b')
  await saveBoard(b.host, emptyBoard())
  b.files.set(b.lead, leadText('a', Date.now()))
  await startHere(b.host)
  expect(S.offHere).toBe(false)
  const r = await runCommand(b.host, 'symcc-drive', '')
  expect(S.offHere).toBe(false)
  expect(r?.text).toContain('Asked session a to hand over')
  expect(parseLead(b.files.get(b.lead)!)).toMatchObject({ session: 'a', handTo: 'b' })
  takeBoardUpdate()
  // /symcc-disable here: /symcc-drive keeps the window off and says how to turn it on
  await disableHere(b.host)
  const off = await runCommand(b.host, 'symcc-drive', '')
  expect(S.offHere).toBe(true)
  expect(off?.text).toBe('symcc is off in this window because you ran /symcc-disable here, so /symcc-drive leaves it off. /symcc-enable turns it on here; then /symcc-drive can make this window drive.')
})
