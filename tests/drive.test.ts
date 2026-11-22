// T-430: /symcc-drive makes the session it is typed in drive the board. Another driving session hands over in
// an orderly way (a request in lead.json, answered on its next heartbeat), never leaving two drivers, and the
// workers it stops for that go back to "todo" without using up a try.
import { expect } from 'claude-code/testing'
import { addTask, emptyBoard, leadText, parseLead, patchTask, startRun, whoDrives, drivesAfter, driveAsk, handRequest, noHandRequest, handedText, handedOff, HANDOVER_NOTE, LEAD_STALE_MS, find, parseCommand, commandNames, type Board, type LeadMove } from '../hooks/board'
import { claimLead, driveHere, handOver, releaseLead } from '../hooks/app/lead'
import { S, workers } from '../hooks/app/state'
import { COMMANDS } from '../hooks/app/symcc'
import { saveBoard } from '../hooks/app/store'
import { test } from './reset'
import { fakeHost, memoryFs, done } from './fake-host'

const t0 = 1_800_000_000_000
const T = '2026-11-18T10:00:00Z'

test('whoDrives: a hand-over request seen by the driver steps it down; the hand-over seen by the requester claims; stale is a takeover; the driver keeps driving', () => {
  const lead = leadText('a', t0)
  // already driving, no request: no change
  expect(whoDrives(lead, 'a', t0 + 30_000)).toBe('keep')
  expect(driveAsk(lead, 'a', t0 + 30_000)).toBe('already')
  // b asks: the request keeps a as the driver, with its heartbeat
  const asked = handRequest(lead, 'b', t0 + 10_000)
  expect(parseLead(asked)).toEqual({ session: 'a', heartbeat: t0, handTo: 'b', handAt: t0 + 10_000 })
  expect(driveAsk(lead, 'b', t0 + 10_000)).toBe('ask')
  expect(driveAsk(asked, 'b', t0 + 20_000)).toBe('asked')
  // asking again keeps the first request's time (so the fallback is not pushed back)
  expect(parseLead(handRequest(asked, 'b', t0 + 50_000))?.handAt).toBe(t0 + 10_000)
  // the driver sees the request: it steps down; the requester waits (follows) meanwhile; a third session follows
  expect(whoDrives(asked, 'a', t0 + 30_000)).toBe('handover')
  expect(whoDrives(asked, 'b', t0 + 30_000)).toBe('follow')
  expect(whoDrives(asked, 'c', t0 + 30_000)).toBe('follow')
  // typing /symcc-drive in the driver cancels the request
  expect(driveAsk(asked, 'a', t0 + 30_000)).toBe('cancel')
  expect(parseLead(noHandRequest(asked))).toEqual({ session: 'a', heartbeat: t0 })
  // the driver handed over: the requester claims; the old driver follows
  const handed = handedText('b', 'a', t0 + 40_000)
  expect(parseLead(handed)).toEqual({ session: 'b', heartbeat: t0 + 40_000, handFrom: 'a' })
  expect(whoDrives(handed, 'b', t0 + 45_000)).toBe('claim')
  expect(whoDrives(handed, 'a', t0 + 45_000)).toBe('follow')
  // /symcc-drive in the gap before b's heartbeat claims: b claims right away
  expect(driveAsk(handed, 'b', t0 + 45_000)).toBe('now')
  // after the claim, the new driver's plain heartbeat
  expect(whoDrives(leadText('b', t0 + 50_000), 'b', t0 + 60_000)).toBe('keep')
  // stale: the normal takeover, with or without a request; and /symcc-drive takes over at once
  expect(whoDrives(lead, 'b', t0 + LEAD_STALE_MS + 1)).toBe('takeover')
  expect(whoDrives(asked, 'b', t0 + LEAD_STALE_MS + 1)).toBe('takeover')
  expect(driveAsk(lead, 'b', t0 + LEAD_STALE_MS + 1)).toBe('now')
  expect(driveAsk(null, 'b', t0)).toBe('now')
  // a driver that keeps beating but never answers: once the request is older than the stale time, the requester takes over
  const ignored = handRequest(leadText('a', t0 + LEAD_STALE_MS), 'b', t0)
  expect(whoDrives(ignored, 'b', t0 + LEAD_STALE_MS)).toBe('follow')
  expect(whoDrives(ignored, 'b', t0 + LEAD_STALE_MS + 1)).toBe('takeover')
})

test('a hand-over never leaves two drivers: at every step of lead.json, at most one of the two sessions drives', () => {
  const drives = (text: string, me: string, at: number) => drivesAfter(whoDrives(text, me, at))
  const steps: [string, number][] = [
    [leadText('a', t0), t0 + 1_000], // a drives
    [handRequest(leadText('a', t0), 'b', t0 + 2_000), t0 + 3_000], // b asked; a is stopping
    [handedText('b', 'a', t0 + 4_000), t0 + 5_000], // a handed over; b claims
    [leadText('b', t0 + 6_000), t0 + 7_000], // b drives
  ]
  const who = steps.map(([text, at]) => ['a', 'b'].filter(me => drives(text, me, at)))
  expect(who).toEqual([['a'], [], ['b'], ['b']])
  // the moves that drive: become, keep, takeover, claim; never follow or handover
  const all: LeadMove[] = ['become', 'keep', 'follow', 'takeover', 'handover', 'claim']
  expect(all.filter(drivesAfter)).toEqual(['become', 'keep', 'takeover', 'claim'])
})

test("a task stopped by the owner's hand-over goes back to todo without using up a try", () => {
  let b: Board = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Work', files: ['src/'] }, T)[0]
  b = patchTask(b, 'T-1', { status: 'doing', live: { session: 'a' }, attempts: 2, runs: startRun(startRun(undefined, T), '2026-11-18T10:05:00Z') }, T)
  // the first try ended earlier
  b = patchTask(b, 'T-1', { runs: [{ ...find(b, 'T-1')!.runs![0]!, ended: '2026-11-18T10:04:00Z' }, find(b, 'T-1')!.runs![1]!] }, T)
  const t = handedOff(find(b, 'T-1')!, '2026-11-18T10:10:00Z')
  expect(t.status).toBe('todo')
  expect(t.attempts).toBe(1)
  expect(t.live?.session).toBeUndefined()
  expect(t.note).toBe(HANDOVER_NOTE)
  expect(t.runs?.length).toBe(1)
  expect(t.history.at(-1)?.text).toBe('try 2: restarted: the owner moved driving to another session')
  // a task no longer doing is left as it is
  expect(handedOff(t, T)).toBe(t)
})

test('/symcc-drive is a command, listed for the host', () => {
  expect(commandNames()).toContain('symcc-drive')
  expect(parseCommand('symcc-drive', '')).toEqual({ kind: 'drive' })
  expect(parseCommand('symcc-drive', 'now')?.kind).toBe('bad')
  expect(COMMANDS().some(c => c.name === `${S.N.name}-drive`)).toBe(true)
})

const ROOT = '/repo'

function world(id = 'me') {
  const files = new Map<string, string>()
  const toasts: string[] = []
  const fs = memoryFs(files)
  const w = fakeHost({
    fs,
    session: { id: async () => id },
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
    ui: { toast: (text: string) => void toasts.push(text) },
  })
  return { ...w, files, toasts, lead: `${ROOT}/${S.N.leadFile}` }
}

async function boardWithWork(w: ReturnType<typeof world>) {
  let b: Board = addTask(emptyBoard(), { origin: { why: 'a test' }, title: 'Work', files: ['src/'] }, T)[0]
  b = patchTask(b, 'T-1', { status: 'doing', live: { session: 'a' }, attempts: 1, runs: startRun(undefined, T) }, T)
  await saveBoard(w.host, b)
}

test('/symcc-drive in a session that already drives changes nothing; with nobody driving it takes over at once', async () => {
  S.root = ROOT
  S.me = 'b'
  const w = world()
  await saveBoard(w.host, emptyBoard())
  expect(await driveHere(w.host)).toBe('This session drives the board now.')
  expect(S.driving).toBe(true)
  expect(parseLead(w.files.get(w.lead)!)?.session).toBe('b')
  const before = w.files.get(w.lead)
  expect(await driveHere(w.host)).toBe('This session already drives the board; nothing changed.')
  expect(w.files.get(w.lead)).toBe(before)
})

test('/symcc-drive asks the driving session to hand over; it stops its workers on its heartbeat, hands lead.json over, and the new session claims', async () => {
  S.root = ROOT
  const w = world()
  await boardWithWork(w)
  // session b asks, while a drives with a fresh heartbeat and runs T-1
  S.me = 'b'
  w.files.set(w.lead, leadText('a', Date.now()))
  const answer = await driveHere(w.host)
  expect(answer).toContain('Asked session a to hand over; it will within 30 s')
  expect(answer).toContain('1 running worker (T-1)')
  expect(answer).toContain("doesn't use up a try")
  expect(S.driving).toBe(false)
  expect(parseLead(w.files.get(w.lead)!)).toMatchObject({ session: 'a', handTo: 'b' })
  expect(await driveHere(w.host)).toContain('Already asked session a')

  // a's heartbeat: it sees the request, stops T-1's worker and hands over
  S.me = 'a'
  S.driving = true
  workers.set('agent-1', { task: 'T-1', worktree: '/wt/T-1', branch: 'symcc/T-1', since: Date.now() })
  expect(await claimLead(w.host)).toBe(false)
  expect(S.driving).toBe(false)
  expect(workers.size).toBe(0)
  expect(w.sent.map(s => s.to)).toContain('agent-1')
  expect(parseLead(w.files.get(w.lead)!)).toMatchObject({ session: 'b', handFrom: 'a' })
  expect(w.toasts.some(t => t.includes('another session drives the board now'))).toBe(true)
  const t = (JSON.parse(w.files.get(`${ROOT}/${S.N.boardFile}`)!) as Board).tasks[0]!
  expect(t.status).toBe('todo')
  expect(t.attempts).toBe(0)
  expect(t.history.at(-1)?.text).toContain(HANDOVER_NOTE)

  // b's heartbeat: it claims, and writes its own plain heartbeat
  S.me = 'b'
  S.driving = false
  expect(await claimLead(w.host)).toBe(true)
  expect(parseLead(w.files.get(w.lead)!)).toEqual({ session: 'b', heartbeat: parseLead(w.files.get(w.lead)!)!.heartbeat })
  // the stopped task is not counted again on the claim
  const after = (JSON.parse(w.files.get(`${ROOT}/${S.N.boardFile}`)!) as Board).tasks[0]!
  expect(after.status).toBe('todo')
  expect(after.attempts).toBe(0)
})

test('/symcc-drive in the gap after the old driver handed over (before this heartbeat) claims right away', async () => {
  S.root = ROOT
  S.me = 'b'
  S.driving = false
  const w = world('b')
  await boardWithWork(w)
  w.files.set(w.lead, handedText('b', 'a', Date.now()))
  expect(await driveHere(w.host)).toBe('This session drives the board now.')
  expect(S.driving).toBe(true)
  expect(parseLead(w.files.get(w.lead)!)).toEqual({ session: 'b', heartbeat: parseLead(w.files.get(w.lead)!)!.heartbeat })
})

test('a hand-over request follows its session after /clear: the new id gets the board', async () => {
  S.root = ROOT
  const w = world('b2')
  await saveBoard(w.host, emptyBoard())
  S.me = 'b'
  S.driving = false
  w.files.set(w.lead, leadText('a', Date.now()))
  await driveHere(w.host)
  // /clear: b goes on as b2; the request moves with it, keeping its time
  const at = parseLead(w.files.get(w.lead)!)!.handAt
  await handOver(w.host)
  expect(S.me).toBe('b2')
  expect(parseLead(w.files.get(w.lead)!)).toMatchObject({ session: 'a', handTo: 'b2', handAt: at })
  // a's heartbeat hands over to b2, and b2's heartbeat claims
  S.me = 'a'
  S.driving = true
  expect(await claimLead(w.host)).toBe(false)
  expect(parseLead(w.files.get(w.lead)!)).toMatchObject({ session: 'b2', handFrom: 'a' })
  S.me = 'b2'
  S.driving = false
  expect(await claimLead(w.host)).toBe(true)
})

test('/clear in the gap after the board was handed over: the new id still gets it', async () => {
  S.root = ROOT
  const w = world('b2')
  await saveBoard(w.host, emptyBoard())
  S.me = 'b'
  S.driving = false
  w.files.set(w.lead, handedText('b', 'a', Date.now()))
  await handOver(w.host)
  expect(parseLead(w.files.get(w.lead)!)).toMatchObject({ session: 'b2', handFrom: 'a' })
  expect(await claimLead(w.host)).toBe(true)
})

test('when the session that asked for the board ends, its request is dropped and the driver keeps driving', async () => {
  S.root = ROOT
  const w = world('b')
  await saveBoard(w.host, emptyBoard())
  S.me = 'b'
  S.driving = false
  w.files.set(w.lead, leadText('a', Date.now()))
  await driveHere(w.host)
  expect(parseLead(w.files.get(w.lead)!)?.handTo).toBe('b')
  await releaseLead(w.host)
  expect(parseLead(w.files.get(w.lead)!)).toEqual({ session: 'a', heartbeat: parseLead(w.files.get(w.lead)!)!.heartbeat })
  S.me = 'a'
  S.driving = true
  expect(await claimLead(w.host)).toBe(true)
  expect(parseLead(w.files.get(w.lead)!)?.session).toBe('a')
})
