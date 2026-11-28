// T-793: /symcc-disable here and /symcc-enable turn symcc off or on in ONE window (kept in that session's state,
// never in board.json). An off-here window gets no lead prompt, no board updates, its tools refuse, it never drives,
// and it stays off, whatever other windows do, until /symcc-enable.
import { expect } from 'claude-code/testing'
import { emptyBoard, leadText, parseLead, parseCommand, offStatusLine, offHereAnswer, LEAD_STALE_MS, addTask, patchTask, find, type Board } from '../hooks/board'
import { claimLead, disableHere, enableHere, offHereBeat, handOver, startHere, driveHere } from '../hooks/app/lead'
import { S, sayQueue, toolName, workers } from '../hooks/app/state'
import { leadBeat, leadGuideText, sessionStart, toolCall, runCommand, COMMANDS } from '../hooks/app/symcc'
import { saveBoard } from '../hooks/app/store'
import { ownerSettings } from '../hooks/app/tools'
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

test('command parsing: disable here; T-934: enable here is gone (plain enable does it); the plain forms and bad words as before', () => {
  expect(parseCommand('symcc-disable', 'here')).toEqual({ kind: 'disable', here: true })
  expect(parseCommand('symcc-enable', 'here')?.kind).toBe('bad')
  expect(parseCommand('symcc-enable', ' Here ')?.kind).toBe('bad')
  expect(parseCommand('symcc-disable', '')).toEqual({ kind: 'disable' })
  expect(parseCommand('symcc-enable', '')).toEqual({ kind: 'enable' })
  expect(parseCommand('symcc-disable', 'now')?.kind).toBe('bad')
  // T-875: the "turn it back on" hint names plain /symcc-enable, never "[here]"
  const bad = parseCommand('symcc-disable', 'foo', undefined, 'symcc') as { message?: string } | null
  expect(JSON.stringify(bad).includes('/symcc-enable turns it back on')).toBe(true)
  expect(JSON.stringify(bad).includes('/symcc-enable [here]')).toBe(false)
  expect(parseCommand('symcc-enable', 'there')?.kind).toBe('bad')
  expect(JSON.stringify(parseCommand('symcc-enable', 'there', undefined, 'symcc')).includes('[here]')).toBe(false)
  expect(COMMANDS().find(c => c.name === 'symcc-disable')?.description).toContain('here')
  expect(COMMANDS().find(c => c.name === 'symcc-disable')?.argumentHint).toBe('[here]')
  expect(COMMANDS().find(c => c.name === 'symcc-enable')?.argumentHint).toBe(undefined)
  expect(COMMANDS().some(c => c.name === 'symcc-scouts')).toBe(false)
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
  expect(offHereAnswer('symcc')).toBe('symcc is off in this window. /symcc-enable turns it back on.')
  expect(w.panel.view()).toMatchObject({ on_here: false, off_here: 'off' })
  expect(offStatusLine('symcc', true, 'off')).toBe('symcc is off in this window · /symcc-enable')

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

test('a window that asked to drive (/drive) and then turns off here drops its request; the old driver keeps the board', async () => {
  S.root = ROOT
  S.me = 'a'
  const w = world('a')
  await saveBoard(w.host, emptyBoard())
  expect(await claimLead(w.host)).toBe(true)
  S.me = 'b'
  S.driving = false
  await driveHere(w.host)
  expect(parseLead(w.files.get(w.lead)!)?.handTo).toBe('b')
  await disableHere(w.host)
  const l = parseLead(w.files.get(w.lead)!)
  expect(l?.session).toBe('a')
  expect(l?.handTo).toBeUndefined()
  S.offHere = false
  S.me = 'a'
  expect(await claimLead(w.host)).toBe(true)
  expect(parseLead(w.files.get(w.lead)!)?.session).toBe('a')
})

test('an off-here window that finds the board handed to it gives it straight back', async () => {
  S.root = ROOT
  S.me = 'b'
  const w = world('b')
  await saveBoard(w.host, emptyBoard())
  S.offHere = true
  w.files.set(w.lead, JSON.stringify({ session: 'b', heartbeat: Date.now(), handFrom: 'a' }))
  await offHereBeat(w.host)
  expect(w.files.has(w.lead)).toBe(false)
  S.offHere = false
  S.me = 'a'
  expect(await claimLead(w.host)).toBe(true)
  expect(parseLead(w.files.get(w.lead)!)?.session).toBe('a')
})

test('/symcc-enable turns the window back on: it tells the lead once, drives again, and the project switch is untouched', async () => {
  S.root = ROOT
  S.me = 'a'
  const w = world('a')
  await saveBoard(w.host, emptyBoard())
  await disableHere(w.host)
  const told: string[] = []
  const said = await enableHere(w.host, t => told.push(t))
  expect(said).toContain('symcc is on in this window, in mode ')
  expect(S.offHere).toBe(false)
  expect(S.enabledNow).toBe(true)
  expect(told).toHaveLength(1)
  expect(told[0]).toContain('turned symcc on in this window with /symcc-enable.')
  expect(S.driving).toBe(true)
  expect(await leadGuideText(w.host)).toBeDefined()
  expect((await enableHere(w.host, t => told.push(t))).startsWith('symcc is already enabled, in mode ')).toBe(true)
  expect(told).toHaveLength(1)
})

test('/symcc-enable through the real command tells the lead with one message', async () => {
  S.root = ROOT
  S.me = 'b'
  const w = world('b')
  await saveBoard(w.host, emptyBoard())
  w.files.set(w.lead, leadText('a', Date.now()))
  await startHere(w.host)
  await disableHere(w.host)
  expect(S.offHere).toBe(true)
  await runCommand(w.host, 'symcc-enable', '')
  expect(S.offHere).toBe(false)
  const update = takeBoardUpdate()
  expect(update).toContain('with /symcc-enable.')
  expect(takeBoardUpdate()).toBeUndefined()
})

test('handOver (after /clear) does not open the panel in an off-here window', async () => {
  S.root = ROOT
  S.me = 'b'
  const w = world('b')
  await saveBoard(w.host, emptyBoard())
  w.files.set(w.lead, leadText('a', Date.now()))
  await startHere(w.host)
  await disableHere(w.host)
  await handOver(w.host)
  expect(w.opened).toEqual([])
})

test('T-875: /symcc-enable with the whole project disabled turns the project on and this window too, and says so', async () => {
  S.root = ROOT
  S.me = 'a'
  const w = world('a')
  await saveBoard(w.host, { ...emptyBoard(), enabled: false, mode: 'paused' })
  const r = await runCommand(w.host, 'symcc-enable', '')
  expect(r?.text).toBe('symcc is on in this window, in mode paused: ⏸ paused: no work runs; tasks in review can still be approved or rejected. No work starts while the board is paused; /symcc-mode auto (or review) starts it.')
  expect(boardOf(w).enabled).toBe(true)
  expect(S.enabledNow).toBe(true)
  expect(await toolCall(w.host, toolName('board'), undefined, {})).not.toEqual({ result: offHereAnswer(S.N.name) })
})

test('T-875: /symcc-enable in a window off here AND a disabled project turns both on, with one lead message', async () => {
  S.root = ROOT
  S.me = 'a'
  const w = world('a')
  await saveBoard(w.host, emptyBoard())
  await disableHere(w.host)
  await saveBoard(w.host, { ...boardOf(w), enabled: false })
  const told: string[] = []
  const said = await enableHere(w.host, t => told.push(t))
  expect(said.startsWith('symcc is on in this window, in mode ')).toBe(true)
  expect(boardOf(w).enabled).toBe(true)
  expect(S.offHere).toBe(false)
  expect(S.enabledNow).toBe(true)
  expect(told).toHaveLength(1)
  expect(takeBoardUpdate()).toBeUndefined()
})

test('T-875: plain /symcc-enable in an off-here window turns this window on; the tools work again', async () => {
  S.root = ROOT
  S.me = 'b'
  const w = world('b')
  await saveBoard(w.host, emptyBoard())
  w.files.set(w.lead, leadText('a', Date.now()))
  await startHere(w.host)
  await disableHere(w.host)
  expect(S.offHere).toBe(true)
  // off here: the plain off answer
  expect(await toolCall(w.host, toolName('board'), undefined, {})).toEqual({ result: offHereAnswer(S.N.name) })
  const r = await runCommand(w.host, 'symcc-enable', '')
  expect(r?.text?.startsWith('symcc is on in this window, in mode ')).toBe(true)
  expect(S.offHere).toBe(false)
  expect(await toolCall(w.host, toolName('board'), undefined, {})).not.toEqual({ result: offHereAnswer(S.N.name) })
  expect(takeBoardUpdate()).toContain('with /symcc-enable.')
  expect(w.panel.view()).toMatchObject({ on_here: true })
  expect(offStatusLine('symcc', false, false)).not.toContain('here')
})

test('T-880: turning enabled on from Settings in an off-here window works like /symcc-enable: the window is on, one lead message', async () => {
  S.root = ROOT
  S.me = 'b'
  const w = world('b')
  await saveBoard(w.host, emptyBoard())
  w.files.set(w.lead, leadText('a', Date.now()))
  await startHere(w.host)
  await disableHere(w.host)
  expect(S.offHere).toBe(true)
  const said = await ownerSettings(w.host, { enabled: true }, 'from the board')
  expect(said.startsWith('symcc is on in this window, in mode ')).toBe(true)
  expect(S.offHere).toBe(false)
  expect(S.enabledNow).toBe(true)
  expect(await toolCall(w.host, toolName('board'), undefined, {})).not.toEqual({ result: offHereAnswer(S.N.name) })
  expect(takeBoardUpdate()).toContain('turned symcc on in this window with /symcc-enable.')
  expect(takeBoardUpdate()).toBeUndefined()
  // the same answer text as /symcc-enable gives in the same state
  await disableHere(w.host)
  const r = await runCommand(w.host, 'symcc-enable', '')
  expect(r?.text).toBe(said)
  // through /symcc-settings enabled on (the OpenCode board sends this) too
  await disableHere(w.host)
  takeBoardUpdate()
  const r2 = await runCommand(w.host, 'symcc-settings', 'enabled on')
  expect(r2?.text).toBe(said)
  expect(S.offHere).toBe(false)
})

test('a second live window starts as a follower: on, a lead, not driving, with the follower notice; board.json is unchanged', async () => {
  S.root = ROOT
  const w = world('b')
  await saveBoard(w.host, { ...emptyBoard(), name: 'quiet-river', open_on_start: true })
  w.files.set(w.lead, leadText('a', Date.now()))
  const before = w.files.get(w.board)
  await sessionStart(w.host)
  expect(S.offHere).toBe(false)
  expect(S.driving).toBe(false)
  expect(w.files.get(w.board)).toBe(before)
  expect(parseLead(w.files.get(w.lead)!)?.session).toBe('a')
  expect(w.toasts.some(t => t.includes('this window follows (') && t.includes('/symcc-drive to drive from here'))).toBe(true)
  expect(w.toasts.some(t => t.includes('/symcc-enable'))).toBe(false)
  expect(w.opened.length).toBe(1)
  expect(w.panel.view()).toMatchObject({ on_here: true, driving: false })
  expect(await leadGuideText(w.host)).toBeDefined()
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
  await startHere(w.host)
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
  await startHere(w.host)
  expect(S.offHere).toBe(false)
})

test('a window turned off with /symcc-disable here stays off and silent when its driver closes and when a new driver appears', async () => {
  S.root = ROOT
  S.me = 'b'
  const w = world('b')
  await saveBoard(w.host, emptyBoard())
  w.files.set(w.lead, leadText('a', Date.now()))
  await startHere(w.host)
  await disableHere(w.host)
  w.toasts.length = 0
  // the driver closes (it lets go of lead.json), long enough ago for any old grace to be over
  await offHereBeat(w.host)
  w.files.delete(w.lead)
  for (let i = 0; i < 4; i++) await offHereBeat(w.host)
  expect(S.offHere).toBe(true)
  expect(S.driving).toBe(false)
  expect(w.toasts).toEqual([])
  expect(sayQueue).toEqual([])
  expect(w.files.has(w.lead)).toBe(false)
  expect(w.panel.view()).toMatchObject({ off_here: 'off' })
  // the heartbeat of the session claims nothing either
  leadBeat(w.host)
  for (let i = 0; i < 30; i++) await Promise.resolve()
  expect(w.files.has(w.lead)).toBe(false)
  // a new driver appears: still off, still silent
  w.files.set(w.lead, leadText('c', Date.now()))
  await offHereBeat(w.host)
  expect(S.offHere).toBe(true)
  expect(w.toasts).toEqual([])
  expect(sayQueue).toEqual([])
  expect(w.panel.view()).toMatchObject({ off_here: 'off' })
  // /symcc-drive still refuses; /symcc-enable turns it on as a follower of c
  const r = await runCommand(w.host, 'symcc-drive', '')
  expect(S.offHere).toBe(true)
  expect(JSON.stringify(r)).toContain('disable here')
  await runCommand(w.host, 'symcc-enable', '')
  expect(S.offHere).toBe(false)
  expect(S.driving).toBe(false)
})

test('T-984: a window that starts while lead.json names its own session (stale or fresh) is not off here', async () => {
  for (const age of [0, LEAD_STALE_MS * 10]) {
    S.root = ROOT
    const w = world('me')
    await saveBoard(w.host, emptyBoard())
    w.files.set(w.lead, leadText('me', Date.now() - age))
    S.me = 'session-made-up' // the host could not answer at first
    await startHere(w.host)
    expect(S.offHere).toBe(false)
    expect(S.me).toBe('me')
    expect(w.toasts).toEqual([])
  }
})

test('T-984: an off-here window that finds its own session in lead.json stays off, and /symcc-drive leaves it off and names /symcc-disable here', async () => {
  S.root = ROOT
  const w = world('me')
  await saveBoard(w.host, emptyBoard())
  S.me = 'me'
  S.offHere = true
  w.files.set(w.lead, leadText('me', Date.now() - LEAD_STALE_MS * 10))
  await offHereBeat(w.host)
  expect(S.offHere).toBe(true)
  const r2 = await runCommand(w.host, `${S.N.name}-drive`, '')
  expect(S.offHere).toBe(true)
  expect(JSON.stringify(r2)).toContain('disable here')
})

test('T-984: a made-up id is swapped for the real one on the next beat, so the window finds itself in lead.json', async () => {
  S.root = ROOT
  S.me = 'session-made-up'
  const w = world('me')
  await saveBoard(w.host, emptyBoard())
  const t0 = Date.now()
  w.files.set(w.lead, leadText('me', t0))
  let up = false
  w.host.session.id = async () => {
    if (!up) throw new Error('not yet')
    return 'me'
  }
  await startHere(w.host)
  up = true
  w.toasts.length = 0 // the host could not name this window at start, so the start notice cannot know it is itself
  await offHereBeat(w.host)
  await offHereBeat(w.host)
  await offHereBeat(w.host)
  expect(S.me).toBe('me')
  expect(S.offHere).toBe(false)
  expect(w.toasts.filter(t => t.includes('closed') || t.includes('another'))).toEqual([])
})

test('T-984: a window driving under a made-up id keeps driving when the host gives the real id', async () => {
  S.root = ROOT
  const w = world('me')
  await saveBoard(w.host, emptyBoard())
  S.me = 'session-made1'
  S.offHere = false
  let up = false
  w.host.session.id = async () => {
    if (!up) throw new Error('not yet')
    return 'real'
  }
  expect(await claimLead(w.host, true)).toBe(true)
  up = true
  w.toasts.length = 0
  expect(await claimLead(w.host)).toBe(true)
  expect(S.driving).toBe(true)
  expect(S.me).toBe('real')
  expect(w.files.get(w.lead)).toContain('real')
  expect(w.toasts.filter(t => t.includes('another'))).toEqual([])
})

/** T-991: a board with T-1 doing for the made-up id 'session-made1', this window driving under that id after claimLead(fresh). */
async function drivingUnderMadeUpId() {
  S.root = ROOT
  const w = world('me')
  await saveBoard(w.host, emptyBoard())
  S.me = 'session-made1'
  S.offHere = false
  let up = false
  w.host.session.id = async () => {
    if (!up) throw new Error('not yet')
    return 'real'
  }
  expect(await claimLead(w.host, true)).toBe(true)
  // the worker starts after the claim (a fresh claim sends doing tasks with no live worker back to todo)
  const T = '2026-11-09T00:00:00.000Z'
  let b = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'running' }, T)[0]
  b = patchTask(b, 'T-1', { status: 'doing', live: { session: 'session-made1' } }, T)
  await saveBoard(w.host, b)
  expect(find(boardOf(w), 'T-1')?.live?.session).toBe('session-made1')
  return { w, up: () => void (up = true) }
}

test('T-991: the id swap moves a running task to the real id, so no second worker starts for it', async () => {
  const { w, up } = await drivingUnderMadeUpId()
  up()
  expect(await claimLead(w.host)).toBe(true)
  const t1 = find(boardOf(w), 'T-1')
  expect(t1?.status).toBe('doing')
  expect(t1?.live?.session).toBe('real')
  expect(parseLead(w.files.get(w.lead) ?? null)?.session).toBe('real')
})

test("T-991: the id swap leaves lead.json alone when another window drives now, and this window stops driving", async () => {
  const { w, up } = await drivingUnderMadeUpId()
  w.files.set(w.lead, leadText('other', Date.now()))
  up()
  w.toasts.length = 0
  expect(await claimLead(w.host)).toBe(false)
  expect(S.me).toBe('real')
  expect(S.driving).toBe(false)
  expect(parseLead(w.files.get(w.lead) ?? null)?.session).toBe('other')
  expect(w.toasts.filter(t => t.includes('drives it now'))).toEqual([])
})

test('T-1016: the driving window gets a new session id: it keeps driving, lead.json gets the new id, tools still work', async () => {
  S.root = ROOT
  S.me = 'a'
  let id = 'a'
  const w = world('a')
  ;(w.host.session as { id: () => Promise<string> }).id = async () => id
  await saveBoard(w.host, emptyBoard())
  expect(await claimLead(w.host)).toBe(true)
  expect(parseLead(w.files.get(w.lead)!)?.session).toBe('a')
  id = 'b'
  expect(await claimLead(w.host)).toBe(true)
  expect(S.me).toBe('b')
  expect(S.driving).toBe(true)
  expect(parseLead(w.files.get(w.lead)!)?.session).toBe('b')
  const r = await toolCall(w.host, toolName('board'), undefined, {})
  expect(String((r as { result?: unknown })?.result ?? '')).not.toContain('off in this window')
})

test('T-1016: session start under a new id in the driving window keeps driving (lead.json moves, tools answer)', async () => {
  S.root = ROOT
  S.me = 'a'
  let id = 'a'
  const w = world('a')
  ;(w.host.session as { id: () => Promise<string> }).id = async () => id
  await saveBoard(w.host, emptyBoard())
  expect(await claimLead(w.host)).toBe(true)
  id = 'b'
  await sessionStart(w.host)
  expect(S.me).toBe('b')
  expect(S.offHere).toBe(false)
  expect(S.driving).toBe(true)
  expect(parseLead(w.files.get(w.lead)!)?.session).toBe('b')
  const r = await toolCall(w.host, toolName('board'), undefined, {})
  expect(String((r as { result?: unknown })?.result ?? '')).not.toContain('off in this window')
})

/** T-1020: this window drives as 'a' with T-1 running under 'a'; `setId` switches the id the host gives. */
async function drivingAsAWithRunningTask() {
  S.root = ROOT
  S.me = 'a'
  S.offHere = false
  workers.clear()
  let id = 'a'
  const w = world('a')
  ;(w.host.session as { id: () => Promise<string> }).id = async () => id
  await saveBoard(w.host, emptyBoard())
  expect(await claimLead(w.host)).toBe(true)
  // the task is saved after the claim (a fresh claim sends doing tasks with no live worker back to todo)
  const T = '2026-11-09T00:00:00.000Z'
  let b = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'running' }, T)[0]
  b = patchTask(b, 'T-1', { status: 'doing', live: { session: 'a' } }, T)
  await saveBoard(w.host, b)
  // its worker runs in this window (the same plugin copy), so the second session start keeps it
  workers.set('ag1', { task: 'T-1', worktree: '/repo/.symcc/worktrees/T-1', branch: 'symcc/T-1', since: 0 })
  expect(find(boardOf(w), 'T-1')?.live?.session).toBe('a')
  return { w, setId: (v: string) => void (id = v) }
}

test('T-1020: session start under a new id in the driving window moves the running task to the new id', async () => {
  const { w, setId } = await drivingAsAWithRunningTask()
  setId('b')
  await sessionStart(w.host)
  const t1 = find(boardOf(w), 'T-1')
  expect(t1?.status).toBe('doing')
  expect(t1?.live?.session).toBe('b')
  expect(parseLead(w.files.get(w.lead)!)?.session).toBe('b')
})

test('T-1020: session start under a new id leaves lead.json alone when another window drives now', async () => {
  const { w, setId } = await drivingAsAWithRunningTask()
  w.files.set(w.lead, leadText('other', Date.now()))
  setId('b')
  await sessionStart(w.host)
  expect(parseLead(w.files.get(w.lead)!)?.session).toBe('other')
  expect(S.driving).toBe(false)
})

test('T-1020: session start under a new id in a window turned off here leaves lead.json alone', async () => {
  const { w, setId } = await drivingAsAWithRunningTask()
  S.offHere = true
  setId('b')
  await sessionStart(w.host)
  expect(parseLead(w.files.get(w.lead)!)?.session).toBe('a')
})
