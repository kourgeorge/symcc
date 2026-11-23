// T-919: a scout whose turn ends while a shell command it sent to the background still runs is woken again by the
// host (under the same id) when that command ends. Before, symcc took that first turn's end as the run's end and
// forgot the scout, so its next shell command was refused with "symcc has no record of this agent". Now the scout
// stays known until a turn ends with nothing left running (its real hand-back), or a long wait passes.
import { expect } from 'claude-code/testing'
import { test } from './reset'
import { checkEdit, unknownAgentText } from '../hooks/app/ask'
import { agentFinished } from '../hooks/app/symcc'
import { SCOUT_WAKE_MS } from '../hooks/app/scouts'
import { emptyBoard } from '../hooks/board'
import { S, scoutRuns, scoutState, stopped, checkerRuns, type CheckerEnd } from '../hooks/app/state'
import { fakeHost, memoryFs, done } from './fake-host'
import { pause } from './fakes'

const ROOT = '/repo'

function world() {
  const files = new Map<string, string>()
  files.set(`${ROOT}/.symcc/board.json`, JSON.stringify({ ...emptyBoard(), mode: 'auto' }))
  const later: { ms: number; f: () => void }[] = []
  const { host } = fakeHost({
    fs: memoryFs(files),
    run: async argv => {
      if (argv[0] === 'mv' && files.has(argv[argv.length - 2]!)) {
        files.set(argv[argv.length - 1]!, files.get(argv[argv.length - 2]!)!)
        files.delete(argv[argv.length - 2]!)
      }
      return done()
    },
    clock: { after: (ms, f) => (later.push({ ms, f }), { cancel() {} }) },
  })
  S.root = ROOT
  S.driving = true
  scoutRuns.set('s1', 'board-review')
  return { host, later }
}

// the host says the agent was started as one of symcc's (so one symcc has no record of is refused)
const symccKind = async () => 'symcc' as const
const settle = async () => {
  for (let i = 0; i < 20; i++) await pause(0)
}

test('T-919: a scout whose turn ended with a background command still running stays known; its next shell command is allowed', async () => {
  const { host } = world()
  expect(await checkEdit(host, 's1', { command: 'claude plugin test .' }, ROOT, symccKind)).toBeUndefined()
  // its turn ends while `claude plugin test .` runs in the background (its SubagentStop listed it)
  agentFinished(host, 's1', { answer: 'Waiting for the tests to finish.', end: { reason: 'answer', background: ['claude plugin test .'] }, isAborted: false, tokens: { input: 10, output: 2 } })
  await settle()
  expect(scoutRuns.get('s1')).toBe('board-review')
  // the host wakes it when the command ends: its next commands still have the scout's rules, not "no record"
  expect(await checkEdit(host, 's1', { command: 'git log -3' }, ROOT, symccKind)).toBeUndefined()
  expect(await checkEdit(host, 's1', { command: 'sh scripts/typecheck.sh' }, ROOT, symccKind)).toBeUndefined()
  // its real hand-back (nothing left running) ends the run: only then is it forgotten
  agentFinished(host, 's1', { answer: 'NOTHING\n\nWhat I checked: the board.', end: { reason: 'answer', background: [] }, isAborted: false, tokens: { input: 5, output: 1 } })
  await settle()
  expect(scoutRuns.has('s1')).toBe(false)
  expect(await checkEdit(host, 's1', { command: 'git log -3' }, ROOT, symccKind)).toBe(unknownAgentText())
})

test('T-919: a scout never woken again ends its run on what it said last, after the wait', async () => {
  const { host, later } = world()
  scoutState.set('board-review', { name: 'board-review', every_minutes: 0, running: true, last_run: null, paused: false } as never)
  agentFinished(host, 's1', { answer: 'Found: X is broken in a.ts:1.', end: { reason: 'answer', background: ['sleep 999'] }, isAborted: false, tokens: undefined })
  await settle()
  expect(scoutRuns.has('s1')).toBe(true)
  const wake = later.find(l => l.ms === SCOUT_WAKE_MS)!
  wake.f()
  await settle()
  expect(scoutRuns.has('s1')).toBe(false)
  expect(scoutState.get('board-review')!.last_report).toBe('Found: X is broken in a.ts:1.')
})

test('T-919: a stopped scout, or one whose turn ended with nothing in the background, ends its run as before', async () => {
  const { host } = world()
  agentFinished(host, 's1', { answer: 'NOTHING', end: { reason: 'answer' }, isAborted: false, tokens: undefined })
  await settle()
  expect(scoutRuns.has('s1')).toBe(false)
  scoutRuns.set('s2', 'board-review')
  stopped.add('s2')
  agentFinished(host, 's2', { answer: 'stopped', end: { reason: 'answer', background: ['sleep 999'] }, isAborted: false, tokens: undefined })
  await settle()
  expect(scoutRuns.has('s2')).toBe(false)
})

test('T-919: a checker whose turn ended with a background command still running stays known; its verdict is its later turn', async () => {
  const { host } = world()
  const WT = `${ROOT}/.symcc/worktrees/T-1`
  const ends: CheckerEnd[] = []
  const end = (e: CheckerEnd) => {
    checkerRuns.delete('c1')
    ends.push(e)
  }
  checkerRuns.set('c1', { task: 'T-1', worktree: WT, end })
  agentFinished(host, 'c1', { answer: 'Waiting for my probe to finish.', end: { reason: 'answer', background: ['bun probe.ts'] }, isAborted: false, tokens: { input: 10, output: 2 } })
  await settle()
  expect(ends.length).toBe(0)
  expect(checkerRuns.has('c1')).toBe(true)
  // woken again: its next shell command is not refused as "no record of this agent"
  expect(await checkEdit(host, 'c1', { command: 'git log -3' }, WT, symccKind)).not.toBe(unknownAgentText())
  // its real hand-back (nothing left running) is the verdict, with both turns' tokens
  agentFinished(host, 'c1', { answer: 'VERDICT: pass', end: { reason: 'answer', background: [] }, isAborted: false, tokens: { input: 5, output: 1 } })
  await settle()
  expect(ends.length).toBe(1)
  expect(ends[0]!.answer).toBe('VERDICT: pass')
  expect(ends[0]!.tokens?.input).toBe(15)
  expect(checkerRuns.has('c1')).toBe(false)
})
