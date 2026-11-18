// What happens when a scout's run ends (T-183): turn.complete hands the scout's answer to scoutFinished (see
// register.tsx). The test kit can't hand the plugin the agent id $.agent.spawn returns, so these tests set up the
// scout run themselves (scoutRuns and scoutState, as runScout leaves them) and call scoutFinished directly, the way
// tests/merge.test.ts calls workerFinished. Files are in memory; the lead's 1.5 s timer is fired by hand.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import type { SymccScout } from '../types'
import { SCOUT_REPORT_CHARS, emptyBoard } from '../hooks/board'
import { scoutFinished } from '../hooks/plugin/scouts'
import { agentFinished } from '../hooks/app/symcc'
import { S, scoutRuns, scoutState, heard, leadQueue, meanwhile } from '../hooks/plugin/state'
import { fakeHost, memoryFs } from './fake-host'

const ROOT = '/repo'
const MEMORY = `${ROOT}/.symcc/scouts.json`
const BOARD = `${ROOT}/.symcc/board.json`
const LAST_RUN = '2026-11-13T00:00:00.000Z'
const BEFORE = '2026-11-12T00:00:00.000Z'

type Res = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Res => ({ exitCode: 0, stdout, stderr: '' })
const fail = (stderr = ''): Res => ({ exitCode: 1, stdout: '', stderr })

/**
 * In-memory files (a board in auto mode; scouts.json as given), a timer list fired by hand, and what reached the
 * lead (`sent`) and the owner (`toasts`). `moveFails`: saving scouts.json (its temp file's mv) fails.
 * One scout "bugs" is running as agent s1, started from `BEFORE`'s last run.
 */
function world(o: { memory?: string; moveFails?: boolean } = {}) {
  const files = new Map<string, string>([[BOARD, JSON.stringify({ ...emptyBoard(), mode: 'auto' })]])
  if (o.memory !== undefined) files.set(MEMORY, o.memory)
  const timers: (() => void)[] = []
  const sent: string[] = []
  const toasts: string[] = []
  const run = async (argv: readonly string[]): Promise<Res> => {
    const [cmd, ...rest] = argv
    if (cmd === 'mv') {
      const [, from, to] = rest
      if (o.moveFails && to === MEMORY) return fail('Read-only file system')
      if (!files.has(from!)) return fail('No such file')
      files.set(to!, files.get(from!)!)
      files.delete(from!)
      return ok()
    }
    if (cmd === 'rm') for (const p of rest.filter(x => !x.startsWith('-'))) files.delete(p)
    // no git, no players: every other command just works and prints nothing
    return ok()
  }
  const { host } = fakeHost({
    run: argv => run(argv),
    fs: memoryFs(files),
    ui: { toast: (t: unknown) => void toasts.push(JSON.stringify(t)) },
    clock: { after: (_ms, f) => (timers.push(f), { cancel() {} }) },
    lead: { send: async text => void sent.push(text) },
  })
  S.root = ROOT
  S.leadTimer = null
  S.writing = Promise.resolve()
  S.driving = false
  S.enabledNow = true
  S.players = Promise.resolve({ system: 'other', voice: [], sound: [] }) as never
  leadQueue.splice(0)
  meanwhile.splice(0)
  delete heard.scouts.bugs
  scoutRuns.clear()
  scoutState.clear()
  const st: SymccScout = { name: 'bugs', every_minutes: 30, last_run: LAST_RUN, running: true, prompt: 'Look for crashes.' }
  scoutState.set('bugs', st)
  scoutRuns.set('s1', 'bugs')
  /** Fires the timers set so far (the lead's 1.5 s wait), then returns what reached the lead. */
  const toLead = () => {
    for (const f of timers.splice(0)) f()
    return sent
  }
  const memory = () => JSON.parse(files.get(MEMORY) ?? '{}') as { scouts?: Record<string, { last_run: string | null; last_report?: string; paused?: boolean }>; usage?: Record<string, { runs: number }> }
  return { $: host, files, st, sent, toasts, toLead, memory }
}

// ---------------- a report with findings ----------------

test("a scout's report is saved to scouts.json as its last report, with the run's time", async () => {
  const w = world()
  await scoutFinished(w.$, 's1', '  1. The parser crashes on empty input.\n2. No test for it.\n  ')
  expect(w.memory().scouts?.bugs).toEqual({ last_run: LAST_RUN, last_report: '1. The parser crashes on empty input.\n2. No test for it.' })
})

test("a scout's report adds one run to its usage in scouts.json", async () => {
  const w = world()
  await scoutFinished(w.$, 's1', '1. Found a crash.')
  expect(w.memory().usage?.bugs?.runs).toBe(1)
})

test("a scout's report tells the lead 'Scout \"bugs\" found 2 things' in one board update", async () => {
  const w = world()
  await scoutFinished(w.$, 's1', '1. The parser crashes on empty input.\n2. No test for it.')
  const sent = w.toLead()
  expect(sent.length).toBe(1)
  expect(sent[0]).toContain('Board update:')
  expect(sent[0]).toContain('Scout "bugs" found 2 things')
})

test("a report with no numbered findings tells the lead the scout 'found something'", async () => {
  const w = world()
  await scoutFinished(w.$, 's1', 'The parser crashes on empty input.')
  expect(w.toLead()[0]).toContain('Scout "bugs" found something')
})

test("a scout's report marks the scout as not running and keeps the report in memory for the panel", async () => {
  const w = world()
  await scoutFinished(w.$, 's1', '1. Found a crash.')
  expect(w.st.running).toBe(false)
  expect(w.st.last_report).toBe('1. Found a crash.')
  expect(scoutRuns.has('s1')).toBe(false)
})

test("a scout's report is noted as the last thing heard from it", async () => {
  const w = world()
  await scoutFinished(w.$, 's1', '1. Found a crash.')
  expect(heard.scouts.bugs).toBeDefined()
  expect(heard.last?.what).toBe('scout bugs report')
})

test(`a report longer than ${SCOUT_REPORT_CHARS} characters is cut to that size in scouts.json`, async () => {
  const w = world()
  await scoutFinished(w.$, 's1', `1. ${'x'.repeat(SCOUT_REPORT_CHARS * 2)}`)
  expect(w.memory().scouts?.bugs?.last_report?.length).toBe(SCOUT_REPORT_CHARS)
})

test("saving the report keeps what else scouts.json had: another scout's entry and the owner's pause", async () => {
  const w = world({ memory: JSON.stringify({ scouts: { bugs: { last_run: LAST_RUN, paused: true }, docs: { last_run: BEFORE } } }) })
  scoutState.set('docs', { name: 'docs', every_minutes: 60, last_run: BEFORE, running: false })
  await scoutFinished(w.$, 's1', '1. Found a crash.')
  expect(w.memory().scouts).toEqual({ bugs: { last_run: LAST_RUN, last_report: '1. Found a crash.', paused: true }, docs: { last_run: BEFORE } })
})

test('the board update for a paused scout tells the lead it does not run again until the owner resumes it', async () => {
  const w = world({ memory: JSON.stringify({ scouts: { bugs: { last_run: LAST_RUN, paused: true } } }) })
  await scoutFinished(w.$, 's1', '1. Found a crash.')
  expect(w.toLead()[0]).toContain('The owner has paused "bugs"')
})

// ---------------- a "NOTHING" report ----------------

test('a "NOTHING" report is saved to scouts.json as the last report', async () => {
  const w = world()
  await scoutFinished(w.$, 's1', 'NOTHING')
  expect(w.memory().scouts?.bugs).toEqual({ last_run: LAST_RUN, last_report: 'NOTHING' })
})

test('a "NOTHING" report sends the lead no board update', async () => {
  const w = world()
  await scoutFinished(w.$, 's1', 'NOTHING')
  expect(w.toLead()).toEqual([])
})

test('a "NOTHING." report with words after it on later lines still sends the lead nothing', async () => {
  const w = world()
  await scoutFinished(w.$, 's1', '\n  NOTHING.\nI looked at the last 5 commits.')
  expect(w.toLead()).toEqual([])
})

test('a "NOTHING" report is not noted as heard from the scout', async () => {
  const w = world()
  await scoutFinished(w.$, 's1', 'nothing')
  expect(heard.scouts.bugs).toBeUndefined()
})

test('an empty report counts as nothing: saved as "", no board update', async () => {
  const w = world()
  await scoutFinished(w.$, 's1', '   \n ')
  expect(w.memory().scouts?.bugs?.last_report).toBe('')
  expect(w.toLead()).toEqual([])
})

test('a report that only starts with the word "nothing" is a finding, not a NOTHING report', async () => {
  const w = world()
  await scoutFinished(w.$, 's1', 'Nothing checks the input length: the parser crashes.')
  expect(w.toLead()[0]).toContain('Scout "bugs" found something')
})

// ---------------- a run that was stopped, and a save that fails ----------------

test('a stopped scout run reports nothing to the lead and keeps the last real report', async () => {
  const w = world()
  w.st.last_report = 'old report'
  await scoutFinished(w.$, 's1', '1. half a finding', true)
  expect(w.toLead()).toEqual([])
  expect(w.st.last_report).toBe('old report')
  expect(w.st.running).toBe(false)
  expect(w.toasts.some(t => t.includes('scout bugs was stopped; nothing reported'))).toBe(true)
})

test('when scouts.json cannot be saved, the lead still gets the finding and a note that the run was not saved', async () => {
  const w = world({ moveFails: true })
  await scoutFinished(w.$, 's1', '1. Found a crash.')
  const sent = w.toLead()
  expect(sent.length).toBe(1)
  expect(sent[0]).toContain("Note: scout bugs's last run was not saved")
  expect(sent[0]).toContain('Scout "bugs" found 1 thing')
  expect(w.files.has(MEMORY)).toBe(false)
})

test('with the plugin turned off, a scout report is saved but the lead gets no board update', async () => {
  const w = world()
  w.files.set(BOARD, JSON.stringify({ ...emptyBoard(), enabled: false }))
  await scoutFinished(w.$, 's1', '1. Found a crash.')
  expect(w.memory().scouts?.bugs?.last_report).toBe('1. Found a crash.')
  expect(w.toLead()).toEqual([])
})

// ---------------- a board.json that can't be read (T-324) ----------------

test("with board.json broken, a scout's report still reaches the lead and is saved; board.json is left as it was", async () => {
  const w = world()
  w.files.set(BOARD, '{ not json')
  await scoutFinished(w.$, 's1', 'Finding: X')
  const sent = w.toLead()
  expect(sent.length).toBe(1)
  expect(sent[0]).toContain('Scout "bugs" found something')
  expect(w.memory().scouts?.bugs?.last_report).toBe('Finding: X')
  expect(w.files.get(BOARD)).toBe('{ not json')
})

test('with board.json broken, a stopped scout run still shows the "was stopped" toast and does not throw', async () => {
  const w = world()
  w.files.set(BOARD, '{ not json')
  await scoutFinished(w.$, 's1', 'Finding: X', true)
  expect(w.toasts.some(t => t.includes('scout bugs was stopped; nothing reported'))).toBe(true)
  expect(w.files.get(BOARD)).toBe('{ not json')
})

// ---------------- a run that ended on an API error or a refusal (T-402) ----------------

for (const end of [{ reason: 'error' }, { reason: 'refusal', refusal: { category: null, explanation: 'cannot help' } }] as const) {
  test(`through agentFinished (turn.complete), a scout run that ended on ${end.reason === 'error' ? 'an error' : 'a refusal'} sends nothing to the lead and keeps its last real run and report`, async () => {
    const w = world({ memory: JSON.stringify({ scouts: { bugs: { last_run: BEFORE, last_report: '1. The old finding.' } } }) })
    w.st.last_report = '1. The old finding.'
    agentFinished(w.$, 's1', { answer: '1. Let me look at src/a.ts next.', end, isAborted: false, tokens: undefined })
    // scoutFinished runs on without being waited for: let its work finish (its toast is the last step)
    for (let i = 0; i < 20_000 && !w.toasts.length; i++) await Promise.resolve()
    expect(w.toLead()).toEqual([])
    expect(w.st.running).toBe(false)
    expect(w.st.last_report).toBe('1. The old finding.')
    // the saved last report is the old one; only the run's usage is counted
    expect(w.memory().scouts!.bugs).toEqual({ last_run: BEFORE, last_report: '1. The old finding.' })
    expect(w.memory().usage!.bugs!.runs).toBe(1)
    expect(scoutRuns.has('s1')).toBe(false)
    expect(w.toasts.join('\n')).toContain(end.reason === 'error' ? "scout bugs's run ended on an error; nothing reported" : "scout bugs's run ended on a refusal; nothing reported")
  })
}
