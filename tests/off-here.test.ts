// T-793: /symcc-disable here and /symcc-enable here turn symcc off or on in ONE window (kept in that session's state,
// never in board.json). A window opened while another live window has symcc on starts off here. An off-here window
// gets no lead prompt, no board updates, its tools refuse, it never drives, and it tells the owner once when the
// symcc window is gone.
import { expect } from 'claude-code/testing'
import { emptyBoard, leadText, parseLead, parseCommand, offStatusLine, offHereAnswer, LEAD_STALE_MS, type Board } from '../hooks/board'
import { claimLead, disableHere, enableHere, offHereBeat, handOver, GONE_REMIND_MS, GONE_GRACE_MS, startOffHere, driveHere } from '../hooks/app/lead'
import { S, sayQueue, toolName } from '../hooks/app/state'
import { leadBeat, leadGuideText, sessionStart, toolCall, runCommand, COMMANDS } from '../hooks/app/symcc'
import { saveBoard } from '../hooks/app/store'
import { tellLead, takeBoardUpdate } from '../hooks/app/tell'
import { test } from './reset'
import { fakeHost, memoryFs, done } from './fake-host'

const ROOT = '/repo'

function world(id: string) {
  const files = new Map<string, string>()
  const toasts: string[] = []
  const opened: string[] = []
  const fs = memoryFs(files)
  const w = fakeHost({
    fs,
    session: { id: async () => id, repo: async () => ({ root: ROOT }), root: async () => ROOT },
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
    ui: { toast: (text: string) => void toasts.push(text), open: (async (a: { id: string }) => (opened.push(a.id), { isPlaced: true })) as never },
  })
  return { ...w, files, toasts, opened, lead: `${ROOT}/${S.N.leadFile}`, board: `${ROOT}/${S.N.boardFile}` }
}

const boardOf = (w: ReturnType<typeof world>) => JSON.parse(w.files.get(w.board)!) as Board

test('command parsing: disable here and enable here; the plain forms and bad words as before', () => {
  expect(parseCommand('symcc-disable', 'here')).toEqual({ kind: 'disable', here: true })
  expect(parseCommand('symcc-enable', 'here')).toEqual({ kind: 'enable', here: true })
  expect(parseCommand('symcc-enable', ' Here ')).toEqual({ kind: 'enable', here: true })
  expect(parseCommand('symcc-disable', '')).toEqual({ kind: 'disable' })
  expect(parseCommand('symcc-enable', '')).toEqual({ kind: 'enable' })
  expect(parseCommand('symcc-disable', 'now')?.kind).toBe('bad')
  expect(parseCommand('symcc-enable', 'there')?.kind).toBe('bad')
  expect(COMMANDS().find(c => c.name === 'symcc-disable')?.description).toContain('here')
})

test('/symcc-disable here: board.json is unchanged, this window gets no lead prompt, no board update, and its tools refuse; another window is not changed', async () => {
  S.root = ROOT
  S.me = 'a'
  const w = world('a')
  await saveBoard(w.host, emptyBoard())
  const before = w.files.get(w.board)
  expect(await claimLead(w.host)).toBe(true)
  expect(await leadGuideText(w.host)).toBeDefined()

  const said = await disableHere(w.host)
  expect(said).toContain('off in this window')
  expect(w.files.get(w.board)).toBe(before)
  expect(boardOf(w).enabled).not.toBe(false)
  // it drove: it handed lead.json back and stops driving
  expect(S.driving).toBe(false)
  expect(w.files.has(w.lead)).toBe(false)
  expect(await leadGuideText(w.host)).toBeUndefined()
  tellLead(w.host, 'something happened')
  expect(w.toLead).toEqual([])
  expect(takeBoardUpdate()).toBeUndefined()
  expect(await toolCall(w.host, toolName('board'), undefined, {})).toEqual({ result: offHereAnswer(S.N.name) })
  expect(offHereAnswer('symcc')).toBe('symcc is off in this window. /symcc-enable here turns it back on.')
  expect(w.panel.view()).toMatchObject({ enabled: false, off_here: 'off' })
  expect(offStatusLine('symcc', true, 'off')).toBe('symcc is off in this window · /symcc-enable here')

  // session B (another window): the same board, symcc on there
  S.offHere = false
  S.enabledNow = true
  S.me = 'b'
  expect(await leadGuideText(w.host)).toBeDefined()
  tellLead(w.host, 'a board update')
  expect(w.toLead.length + (takeBoardUpdate() ? 1 : 0)).toBeGreaterThan(0)
})

test('a driving window turned off here never drives again; with another window open that window takes over', async () => {
  S.root = ROOT
  S.me = 'a'
  const w = world('a')
  await saveBoard(w.host, emptyBoard())
  await claimLead(w.host)
  expect(S.driving).toBe(true)
  await disableHere(w.host)
  // nobody drives: this window still does not take driving
  expect(await claimLead(w.host)).toBe(false)
  expect(await claimLead(w.host, true)).toBe(false)
  expect(S.driving).toBe(false)
  expect(w.files.has(w.lead)).toBe(false)
  expect(await driveHere(w.host)).toBe(offHereAnswer(S.N.name))
  leadBeat(w.host)
  await Promise.resolve()
  expect(w.files.has(w.lead)).toBe(false)
  // window b takes over
  S.offHere = false
  S.me = 'b'
  expect(await claimLead(w.host)).toBe(true)
  expect(parseLead(w.files.get(w.lead)!)?.session).toBe('b')
})

test('/symcc-enable here turns the window back on: it tells the lead once, drives again, and the project switch is untouched', async () => {
  S.root = ROOT
  S.me = 'a'
  const w = world('a')
  await saveBoard(w.host, emptyBoard())
  await disableHere(w.host)
  const told: string[] = []
  const said = await enableHere(w.host, t => told.push(t))
  expect(said).toContain('on in this window again')
  expect(S.offHere).toBe(false)
  expect(S.enabledNow).toBe(true)
  expect(told).toHaveLength(1)
  expect(told[0]).toContain('enable here')
  expect(S.driving).toBe(true)
  expect(await leadGuideText(w.host)).toBeDefined()
  expect(await enableHere(w.host, t => told.push(t))).toContain('already on')
  expect(told).toHaveLength(1)
})

test('/symcc-enable here through the real command tells the lead with one message', async () => {
  S.root = ROOT
  S.me = 'b'
  const w = world('b')
  await saveBoard(w.host, emptyBoard())
  w.files.set(w.lead, leadText('a', Date.now()))
  await startOffHere(w.host)
  expect(S.offHere).toBe(true)
  await runCommand(w.host, 'symcc-enable', 'here')
  expect(S.offHere).toBe(false)
  const update = takeBoardUpdate()
  expect(update).toContain('enable here')
  expect(takeBoardUpdate()).toBeUndefined()
})

test('handOver (after /clear) does not open the panel in an off-here window', async () => {
  S.root = ROOT
  S.me = 'b'
  const w = world('b')
  await saveBoard(w.host, emptyBoard())
  w.files.set(w.lead, leadText('a', Date.now()))
  await startOffHere(w.host)
  await handOver(w.host)
  expect(w.opened).toEqual([])
})

test('the take-over line waits a grace so a second on-window can claim lead.json first', async () => {
  S.root = ROOT
  S.me = 'b'
  const w = world('b')
  await saveBoard(w.host, emptyBoard())
  const t0 = Date.now()
  w.files.set(w.lead, leadText('a', t0))
  await startOffHere(w.host)
  w.toasts.length = 0
  w.files.delete(w.lead)
  await offHereBeat(w.host, t0 + 1000)
  expect(w.toasts).toEqual([])
  w.files.set(w.lead, leadText('c', t0 + 30_000))
  await offHereBeat(w.host, t0 + 31_000)
  await offHereBeat(w.host, t0 + 31_000 + GONE_GRACE_MS)
  expect(w.toasts).toEqual([])
  expect(w.files.has(`${ROOT}/${S.N.dir}/gone.json`)).toBe(false)
  expect(S.offWhy).toBe('other')
  // nobody claims: the line shows once after the grace
  w.files.delete(w.lead)
  const t1 = t0 + 200_000
  await offHereBeat(w.host, t1)
  expect(w.toasts).toEqual([])
  await offHereBeat(w.host, t1 + GONE_GRACE_MS)
  await offHereBeat(w.host, t1 + GONE_GRACE_MS + 30_000)
  expect(w.toasts).toHaveLength(1)
})

test('/symcc-enable here with the whole project disabled says so and points to /symcc-enable', async () => {
  S.root = ROOT
  S.me = 'a'
  const w = world('a')
  await saveBoard(w.host, { ...emptyBoard(), enabled: false })
  const told: string[] = []
  const said = await enableHere(w.host, t => told.push(t))
  expect(said).toContain('disabled for the whole project')
  expect(said).toContain('/symcc-enable.')
  expect(told).toEqual([])
})

test('a second live window starts off here with a short notice; board.json is unchanged and its panel does not open', async () => {
  S.root = ROOT
  const w = world('b')
  await saveBoard(w.host, { ...emptyBoard(), open_on_start: true })
  w.files.set(w.lead, leadText('a', Date.now()))
  const before = w.files.get(w.board)
  await sessionStart(w.host)
  expect(S.offHere).toBe(true)
  expect(S.driving).toBe(false)
  expect(w.files.get(w.board)).toBe(before)
  expect(parseLead(w.files.get(w.lead)!)?.session).toBe('a')
  expect(w.toasts.some(t => t.includes('symcc runs in another window · /symcc-enable here to use it here too'))).toBe(true)
  expect(w.opened).toEqual([])
  expect(w.panel.view()).toMatchObject({ enabled: false, off_here: 'other' })
  expect(offStatusLine('symcc', true, 'other')).toBe('symcc runs in another window · /symcc-enable here')
  expect(await leadGuideText(w.host)).toBeUndefined()
  // /symcc-enable here opens the panel as on start and makes it a lead
  await enableHere(w.host, () => undefined)
  expect(w.opened.length).toBe(1)
})

test('the first window starts with symcc on, and opens its panel', async () => {
  S.root = ROOT
  const w = world('a')
  await saveBoard(w.host, { ...emptyBoard(), open_on_start: true })
  await sessionStart(w.host)
  expect(S.offHere).toBe(false)
  expect(S.driving).toBe(true)
  expect(w.opened.length).toBe(1)
})

test('a stale first window (old driving marker) does not make a new window start off here', async () => {
  S.root = ROOT
  S.me = 'b'
  const w = world('b')
  await saveBoard(w.host, emptyBoard())
  w.files.set(w.lead, leadText('a', Date.now() - LEAD_STALE_MS - 5_000))
  await startOffHere(w.host)
  expect(S.offHere).toBe(false)
  expect(w.toasts).toEqual([])
  expect(await claimLead(w.host, true)).toBe(true)
})

test('a project disabled as a whole does not start a window off here', async () => {
  S.root = ROOT
  S.me = 'b'
  const w = world('b')
  await saveBoard(w.host, { ...emptyBoard(), enabled: false })
  w.files.set(w.lead, leadText('a', Date.now()))
  await startOffHere(w.host)
  expect(S.offHere).toBe(false)
})

test('when the only window with symcc on goes away, an off-here window says so once and does not start driving', async () => {
  S.root = ROOT
  S.me = 'b'
  const w = world('b')
  await saveBoard(w.host, emptyBoard())
  w.files.set(w.lead, leadText('a', Date.now()))
  await startOffHere(w.host)
  expect(S.offHere).toBe(true)
  w.toasts.length = 0
  // a still drives: nothing to tell
  await offHereBeat(w.host)
  expect(w.toasts).toEqual([])
  // a closes (it lets go of lead.json)
  w.files.delete(w.lead)
  const tn = Date.now()
  await offHereBeat(w.host, tn)
  await offHereBeat(w.host, tn + GONE_GRACE_MS)
  await offHereBeat(w.host, tn + GONE_GRACE_MS + 1000)
  expect(w.toasts).toHaveLength(1)
  expect(w.toasts[0]).toContain('the symcc window closed · /symcc-enable here to take over')
  expect(S.driving).toBe(false)
  expect(w.files.has(w.lead)).toBe(false)
  expect(w.panel.view()).toMatchObject({ off_here: 'gone' })
  expect(offStatusLine('symcc', true, 'gone')).toBe('the symcc window closed · /symcc-enable here to take over')
  // the heartbeat of the session does the same and still claims nothing
  leadBeat(w.host)
  for (let i = 0; i < 30; i++) await Promise.resolve()
  expect(w.files.has(w.lead)).toBe(false)
  expect(w.toasts).toHaveLength(1)
})

test('nobody takes over: "needs you" plays once, 15 minutes after the take-over line, from one window only', async () => {
  S.root = ROOT
  S.me = 'b'
  const w = world('b')
  await saveBoard(w.host, emptyBoard())
  const t0 = Date.now()
  w.files.set(w.lead, leadText('a', t0))
  await startOffHere(w.host)
  w.files.delete(w.lead)
  await offHereBeat(w.host, t0 + 1000) // first missed
  const t1 = t0 + 1000 + GONE_GRACE_MS
  await offHereBeat(w.host, t1) // the take-over line shows; the note starts
  expect(sayQueue).toEqual([])
  await offHereBeat(w.host, t1 + GONE_REMIND_MS - 1000)
  expect(sayQueue).toEqual([])
  await offHereBeat(w.host, t1 + GONE_REMIND_MS)
  expect(sayQueue).toEqual(['?'])
  // not again, and a second off-here window (same files) does not play it either
  await offHereBeat(w.host, t1 + GONE_REMIND_MS + 60_000)
  S.me = 'c'
  await offHereBeat(w.host, t1 + GONE_REMIND_MS + 120_000)
  expect(sayQueue).toEqual(['?'])
  expect(S.driving).toBe(false)
})

test('the reminder does not play when a window took over first, or when notify is off', async () => {
  S.root = ROOT
  S.me = 'b'
  const w = world('b')
  await saveBoard(w.host, emptyBoard())
  const t0 = Date.now()
  w.files.set(w.lead, leadText('a', t0))
  await startOffHere(w.host)
  w.files.delete(w.lead)
  await offHereBeat(w.host, t0 + 1000)
  // another window takes over before the time is up
  w.files.set(w.lead, leadText('c', t0 + 5 * 60_000))
  await offHereBeat(w.host, t0 + 5 * 60_000)
  await offHereBeat(w.host, t0 + 1000 + GONE_REMIND_MS + 1000)
  expect(sayQueue).toEqual([])
  // notify off: nothing is queued
  const w2 = world('b')
  await saveBoard(w2.host, { ...emptyBoard(), notify: 'off' })
  S.offHere = true
  S.offWhy = 'other'
  S.sawOther = true
  S.takeoverTold = false
  await offHereBeat(w2.host, t0)
  await offHereBeat(w2.host, t0 + GONE_REMIND_MS + 1)
  expect(sayQueue).toEqual([])
})
