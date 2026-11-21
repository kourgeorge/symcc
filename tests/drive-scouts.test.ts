// T-759: after driving the board moves to another session, the old session starts no scout run (nor worker), a scout
// run in flight at the hand-over is stopped with a plain "driving moved" note (never refused as an agent symcc has no
// record of, nor told the board tool is only for the lead), and such a run reports no finding.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { pause, entry } from './fakes'
import { withStarts } from './starts'
import { emptyBoard, leadText, handRequest, parseLead } from '../hooks/board'
import { claimLead } from '../hooks/app/lead'
import { runScout, runScoutNow, scoutFinished, loadScoutRunHistory, scheduleScouts } from '../hooks/app/scouts'
import { checkEdit, movedText, unknownAgentText } from '../hooks/app/ask'
import { toolCall, notLeadText } from '../hooks/app/symcc'
import { S, scoutState, scoutRuns, timers, leadQueue, DRIVING_MOVED } from '../hooks/app/state'
import { fakeHost } from './fake-host'
import type { HostAgent } from '../hooks/host'

const ROOT = '/repo'
const LEAD = `${ROOT}/.symcc/lead.json`

/** In-memory files (a board in auto mode, one on-demand scout "gaps"), what was started (`spawns`) and told to the lead. */
function world(o: { agents?: HostAgent[] } = {}) {
  const files = new Map<string, string>()
  files.set(`${ROOT}/.symcc/board.json`, JSON.stringify({ ...emptyBoard(), mode: 'auto' }))
  files.set(`${ROOT}/.symcc/scouts/gaps.md`, '---\nevery_minutes: 0\n---\nLook for gaps.\n')
  const toasts: string[] = []
  const later: (() => void)[] = []
  const w = fakeHost({
    fs: {
      exists: async (p: string) => files.has(p) || [...files.keys()].some(k => k.startsWith(`${p}/`)),
      read: async (p: string) => {
        if (!files.has(p)) throw new Error(`no file ${p}`)
        return files.get(p)!
      },
      write: async (p: string, t: string) => void files.set(p, t),
      list: async (d: string) => [...files.keys()].filter(k => k.startsWith(`${d}/`)).map(k => entry(k.slice(d.length + 1))),
    },
    run: async argv => {
      const args = argv.slice(1).filter(a => !a.startsWith('-'))
      if (argv[0] === 'mv') {
        files.set(args[1]!, files.get(args[0]!)!)
        files.delete(args[0]!)
      }
      if (argv[0] === 'ln' && !files.has(args[1]!)) files.set(args[1]!, files.get(args[0]!) ?? '')
      if (argv[0] === 'rm') for (const a of args) files.delete(a)
      return { exitCode: 0, stdout: argv[0] === 'git' ? 'main' : '', stderr: '' }
    },
    agents: { list: async () => o.agents ?? [] },
    ui: { toast: (t: unknown) => void toasts.push(String(t)) },
    clock: { after: (_ms, f) => (later.push(f), { cancel() {} }) },
    lead: { send: async () => undefined },
  })
  S.root = ROOT
  S.me = 'a'
  S.driving = true
  S.gitState = 'ok'
  S.enabledNow = true
  S.leadTimer = null
  scoutState.clear()
  scoutRuns.clear()
  timers.splice(0)
  leadQueue.splice(0)
  return { ...w, files, toasts, later }
}

test('(a) after the owner moves driving to another session, the old session starts no scout run', async () => {
  const w = world()
  // session b asked for the board; a's heartbeat hands it over
  w.files.set(LEAD, handRequest(leadText('a', Date.now()), 'b', Date.now()))
  expect(await claimLead(w.host)).toBe(false)
  expect(parseLead(w.files.get(LEAD)!)).toMatchObject({ session: 'b', handFrom: 'a' })
  expect(await runScoutNow(w.host, 'gaps')).toContain('scouts run in the session that drives the board')
  await withStarts(w.host, runScout(w.host, { name: 'gaps', every_minutes: 0, prompt: 'Look for gaps.' }))
  expect(w.spawns.length).toBe(0)
  expect(scoutState.get('gaps')?.running).toBe(false)
})

test('(a) a copy whose S.driving is out of date starts no scout run once lead.json says another session drives, nor while a hand-over is asked', async () => {
  const w = world()
  await scheduleScouts(w.host)
  w.files.set(LEAD, leadText('b', Date.now()))
  const why = await withStarts(w.host, runScout(w.host, { name: 'gaps', every_minutes: 0, prompt: 'Look for gaps.' }))
  expect(why).toContain('scouts run in the session that drives the board')
  w.files.set(LEAD, handRequest(leadText('a', Date.now()), 'b', Date.now()))
  await withStarts(w.host, runScout(w.host, { name: 'gaps', every_minutes: 0, prompt: 'Look for gaps.' }))
  expect(w.spawns.length).toBe(0)
  expect(scoutRuns.size).toBe(0)
  // still driving, with no hand-over asked: it starts as before
  w.files.set(LEAD, leadText('a', Date.now()))
  expect(await withStarts(w.host, runScout(w.host, { name: 'gaps', every_minutes: 0, prompt: 'Look for gaps.' }))).toBe('')
  expect(w.spawns.length).toBe(1)
})

test('(b) a scout run in flight at the hand-over is stopped with a plain "driving moved" note, not refused as unknown', async () => {
  const w = world({ agents: [{ id: 's1', kind: 'scout', status: 'running' }] })
  await scheduleScouts(w.host)
  scoutRuns.set('s1', 'gaps')
  w.files.set(LEAD, handRequest(leadText('a', Date.now()), 'b', Date.now()))
  expect(await claimLead(w.host)).toBe(false)
  expect(w.sent.some(s => s.to === 's1')).toBe(true)
  expect(movedText()).toContain(`answer "${DRIVING_MOVED}"`)
  for (const touch of [{ command: 'git log -3' }, { path: '/tmp/probe.ts' }]) {
    const r = await checkEdit(w.host, 's1', touch, ROOT, async () => 'symcc')
    expect(r).toBe(movedText())
    expect(r === unknownAgentText()).toBe(false)
  }
  const board = await toolCall(w.host, 'board', 's1', {})
  expect(board).toEqual({ deny: movedText() })
})

test('(b) a scout of symcc this session has no record of, after driving moved, gets the "driving moved" note for its shell and its board call', async () => {
  const w = world({ agents: [{ id: 's9', kind: 'scout', status: 'running' }] })
  S.driving = false
  w.files.set(LEAD, leadText('b', Date.now()))
  expect(await checkEdit(w.host, 's9', { command: 'ls' }, ROOT, async () => 'symcc')).toBe(movedText())
  expect(await toolCall(w.host, 'board', 's9', {})).toEqual({ deny: movedText() })
  // with this session still named the driver, an agent symcc has no record of keeps the old answers
  w.files.set(LEAD, leadText('a', Date.now()))
  expect(await checkEdit(w.host, 'x1', { command: 'ls' }, ROOT, async () => 'symcc')).toBe(unknownAgentText())
  expect(await toolCall(w.host, 'board', 'x2', {})).toEqual({ deny: notLeadText('board') })
})

test('(c) a scout run that ends "stopped: driving moved to another session" reports no finding', async () => {
  const w = world()
  await scheduleScouts(w.host)
  scoutRuns.set('s1', 'gaps')
  scoutState.get('gaps')!.running = true
  await scoutFinished(w.host, 's1', DRIVING_MOVED)
  for (const f of w.later.splice(0)) f()
  await pause(0)
  expect(leadQueue.some(l => l.includes('found'))).toBe(false)
  expect(w.toLead.some(l => l.includes('found'))).toBe(false)
  const runs = await loadScoutRunHistory(w.host, 'gaps')
  expect(runs.at(-1)).toMatchObject({ outcome: 'stopped', findings: 0, why: DRIVING_MOVED })
  expect(w.toasts.some(t => t.includes(`scout gaps ${DRIVING_MOVED}; nothing reported`))).toBe(true)
  expect(scoutState.get('gaps')?.running).toBe(false)
})
